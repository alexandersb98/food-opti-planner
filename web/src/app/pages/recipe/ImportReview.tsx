import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../../../api/client'
import type { Ingredient } from '../../../api/types'
import {
  acceptable,
  factorSource,
  lineState,
  pendingKey,
  suggestedFactorFor,
  type FactorRow,
  type LineState,
} from '../../../importReview'
import { isOwn, type Ratio } from '../../../lineUnits'
import { linesOf, type DraftLine, type RecipeDraft } from '../../../recipeDraft'
import { useT } from '../../i18n/i18n'
import { buttonClass } from '../../ui/button/Button'
import { Sheet } from '../../ui/sheet/Sheet'
import { IngredientForm } from '../ingredient/IngredientForm'
import { IngredientPicker } from './IngredientPicker'
import { ReviewBanner } from './ReviewBanner'
import { ReviewPanel, reviewIds as ids } from './ReviewPanel'
import * as review from './reviewEdits'
import type { LineErrorsCleared } from './useRecipeDraft'
import './import-review.css'

// The import review (ticket 35): an imported recipe opens as a new spread in
// edit mode, with a banner above the head saying where it came from and how
// many lines need the owner, and each imported line showing its source text
// and what it needs (pick an ingredient, give a factor, pick another unit, or
// skip). The pure rules are `src/importReview.ts`; the draft's changes are
// `reviewEdits.ts`, run through useRecipeDraft's `edit`. Each line's panel is
// ReviewPanel, the banner ReviewBanner; leaving unsaved is LeaveGuard's.

/** What the review adds to one line in the line editor. */
export interface LineReview {
  state: LineState
  /** The line as the text had it, above the line. */
  source: ReactNode
  /** What the line needs, under it; null for a settled line. */
  panel: ReactNode
}

/** The states in which a line needs the owner. */
const NEEDS: readonly LineState[] = ['unmatched', 'needs_factor', 'bad_unit']

/** What the owner typed in a factor box, and whether the AI is asked. */
type Typed = Partial<Record<string, { text: string; loading: boolean }>>

export interface ImportReviewOptions {
  draft: RecipeDraft
  /** useRecipeDraft's `edit`. */
  edit: (change: (draft: RecipeDraft) => RecipeDraft, clears?: LineErrorsCleared) => void
  ingredients: ReadonlyMap<number, Ingredient>
  ratio: Ratio
  /** A new ingredient was made ("+ New ingredient"): the page keeps it. */
  onIngredientChanged: (ingredient: Ingredient) => void
  /** The editor's form, where the lines that need the owner are found. */
  formRef: RefObject<HTMLFormElement | null>
}

/**
 * The review of an imported draft, or null for any other. Gives the banner,
 * each line's review (`line(line, name)`), the sheets it opens (the picker
 * and the new ingredient form), how many lines need the owner, and `refuse`
 * for a Save while some do.
 */
export function useImportReview({
  draft,
  edit,
  ingredients,
  ratio,
  onIngredientChanged,
  formRef,
}: ImportReviewOptions) {
  const t = useT()
  const [typed, setTyped] = useState<Typed>({})
  // The AI's numbers asked for lines matched by hand, by `pendingKey`.
  const [suggestions, setSuggestions] = useState<Partial<Record<string, string>>>({})
  // The line whose "Pick ingredient" opened the picker; the sheets keep it
  // while they slide away.
  const [picker, setPicker] = useState({ open: false, line: 0 })
  const [creating, setCreating] = useState({ open: false, line: 0 })
  // Each Save refused while lines need the owner, so the message is said again.
  const [refused, setRefused] = useState(0)
  // Where the focus goes once the page shows a change, or a sheet closes.
  const nextFocus = useRef('')
  const scrolled = useRef(-1)
  useEffect(() => {
    if (!nextFocus.current || document.querySelector('dialog[open]')) return
    document.getElementById(nextFocus.current)?.focus()
    nextFocus.current = ''
  })
  const [finalFocus] = useState(() => ({
    get current() {
      const target = nextFocus.current ? document.getElementById(nextFocus.current) : null
      nextFocus.current = ''
      return target
    },
  }))

  const { imported, pending } = draft
  if (!imported) return null

  const all = linesOf(draft)
  const ingredientOf = (line: DraftLine) =>
    line.ingredientId === null ? undefined : ingredients.get(line.ingredientId)
  const stateOf = (line: DraftLine) => lineState(line, ingredientOf(line), pending, ratio)
  const needs = all.filter((line) => NEEDS.includes(stateOf(line))).length
  const find = (key: number) => all.find((line) => line.key === key)

  /** The AI's number for a line's ingredient and unit, if it gave one. */
  function suggestedFor(line: DraftLine, lines: readonly DraftLine[] = all): string | null {
    if (line.ingredientId === null) return null
    return suggestions[pendingKey(line.ingredientId, line.unit)] ?? suggestedFactorFor(line, lines)
  }

  function factorRow(line: DraftLine, state: LineState): FactorRow | null {
    if (line.ingredientId === null || line.skipped) return null
    const key = pendingKey(line.ingredientId, line.unit)
    const accepted = pending.find((p) => pendingKey(p.ingredientId, p.unit) === key)
    if (accepted) return { text: accepted.factor, ai: accepted.source === 'ai', loading: false, accepted: true }
    if (state !== 'needs_factor') return null
    const suggested = suggestedFor(line)
    const row = typed[key]
    const text = row?.text ?? suggested ?? ''
    return {
      text,
      ai: suggested !== null && factorSource(text, suggested) === 'ai',
      loading: row?.loading ?? false,
      accepted: false,
    }
  }

  /** Ask the AI for a number for a line matched by hand that needs one. */
  async function suggest(line: DraftLine, ingredient: Ingredient, lines: readonly DraftLine[]) {
    if (lineState(line, ingredient, pending, ratio) !== 'needs_factor' || suggestedFor(line, lines) !== null) return
    const key = pendingKey(ingredient.id, line.unit)
    if (typed[key]?.loading) return
    setTyped((all) => ({ ...all, [key]: { text: all[key]?.text ?? '', loading: true } }))
    let factor: string | null = null
    try {
      const { data } = await api.POST('/api/recipe-imports/factor', {
        body: { ingredient_id: ingredient.id, unit: line.unit, food: line.food || line.unit },
      })
      factor = data?.factor ?? null
    } catch {
      // no suggestion: the box stays empty to type in
    }
    if (factor !== null) setSuggestions((all) => ({ ...all, [key]: factor }))
    setTyped((all) => ({ ...all, [key]: { text: all[key]?.text || (factor ?? ''), loading: false } }))
  }

  /** Match the line that asked with an ingredient: its unit stays as
   * imported (empty when it is the ingredient's own), and a number is asked
   * for if it needs one. */
  function match(key: number, ingredient: Ingredient) {
    const line = find(key)
    if (!line) return
    const unit = isOwn(ratio, ingredient, line.unit) ? '' : line.unit
    const matched: DraftLine = {
      ...line,
      ingredientId: ingredient.id,
      unit,
      suggestedFactor: null,
      suggestedUnit: undefined,
    }
    const lines = all.map((other) => (other.key === key ? matched : other))
    edit((draft) => review.matchLine(draft, key, ingredient.id, unit), { lineIngredients: key, unitErrors: key })
    const needsFactor = lineState(matched, ingredient, pending, ratio) === 'needs_factor'
    nextFocus.current = needsFactor ? ids.factor(key) : ids.amount(key)
    void suggest(matched, ingredient, lines)
  }

  function picked(ingredient: Ingredient) {
    match(picker.line, ingredient)
    setPicker((p) => ({ ...p, open: false }))
  }

  function created(ingredient: Ingredient) {
    onIngredientChanged(ingredient)
    match(creating.line, ingredient)
    setCreating((c) => ({ ...c, open: false }))
  }

  function newIngredient() {
    setPicker((p) => ({ ...p, open: false }))
    setCreating({ open: true, line: picker.line })
  }

  function skip(line: DraftLine, skipped: boolean) {
    nextFocus.current = skipped
      ? ids.unskip(line.key)
      : line.ingredientId === null
        ? ids.pick(line.key)
        : ids.amount(line.key)
    edit((draft) => review.skipLine(draft, line.key, skipped), {
      lineIngredients: line.key,
      amounts: line.key,
      unitErrors: line.key,
    })
  }

  function accept(line: DraftLine, text: string) {
    const factor = acceptable(text)
    if (line.ingredientId === null || factor === null) return
    const ingredientId = line.ingredientId
    const source = factorSource(text, suggestedFor(line))
    nextFocus.current = ids.change(line.key)
    edit((draft) => review.acceptFactor(draft, { ingredientId, unit: line.unit, factor, source }), {
      unitErrors: line.key,
    })
    setTyped((all) => ({ ...all, [pendingKey(ingredientId, line.unit)]: undefined }))
  }

  /** Back to the factor box, with the accepted number in it. */
  function change(line: DraftLine) {
    if (line.ingredientId === null) return
    const ingredientId = line.ingredientId
    const key = pendingKey(ingredientId, line.unit)
    const accepted = pending.find((p) => pendingKey(p.ingredientId, p.unit) === key)
    nextFocus.current = ids.factor(line.key)
    edit((draft) => review.forgetFactor(draft, ingredientId, line.unit))
    setTyped((all) => ({ ...all, [key]: { text: accepted?.factor ?? '', loading: false } }))
  }

  function typeFactor(line: DraftLine, text: string) {
    if (line.ingredientId === null) return
    const key = pendingKey(line.ingredientId, line.unit)
    setTyped((all) => ({ ...all, [key]: { text, loading: false } }))
  }

  /** The lines that need the owner, in page order. */
  const needing = () => [...(formRef.current?.querySelectorAll<HTMLElement>('.review-needs') ?? [])]

  /** Bring a line that needs the owner into view, with the focus on its
   * first action. */
  function show(target: HTMLElement | undefined) {
    if (!target) return
    target.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    target.querySelector<HTMLElement>('.review-panel input, .review-panel button')?.focus({ preventScroll: true })
  }

  /** The banner's "Next line that needs you": cycles through them. */
  function showNext() {
    const lines = needing()
    if (lines.length === 0) return
    scrolled.current = (scrolled.current + 1) % lines.length
    show(lines[scrolled.current])
  }

  /** A Save while lines need the owner: say so again and go to the first. */
  function refuse() {
    setRefused((n) => n + 1)
    scrolled.current = 0
    show(needing()[0])
  }

  function line(line: DraftLine, name: string): LineReview {
    const state = stateOf(line)
    const named = (action: string) => t('recipes.buttonFor', { action, name })
    return {
      state,
      source: line.originalText ? (
        <p className="review-source">
          <span className="visually-hidden">{t('recipe.review.fromText')} </span>
          {line.originalText}
        </p>
      ) : null,
      panel: (
        <ReviewPanel
          line={line}
          state={state}
          factor={factorRow(line, state)}
          own={ingredientOf(line)?.unit ?? ''}
          name={name}
          named={named}
          onPick={() => setPicker({ open: true, line: line.key })}
          onSkip={(skipped) => skip(line, skipped)}
          onAccept={(text) => accept(line, text)}
          onChange={() => change(line)}
          onType={(text) => typeFactor(line, text)}
        />
      ),
    }
  }

  const pickedLine = find(picker.line)
  const creatingLine = find(creating.line)
  const food = (creatingLine?.food ?? '').trim()

  const banner = <ReviewBanner site={imported.site} cut={imported.cut} needs={needs} refused={refused} onNext={showNext} />
  const sheets = (
    <>
      <IngredientPicker
        open={picker.open}
        onClose={() => setPicker((p) => ({ ...p, open: false }))}
        title={t('recipe.review.pickTitle', { food: pickedLine?.food || pickedLine?.originalText || '' })}
        ingredients={[...ingredients.values()]}
        initialSearch={pickedLine?.food ?? ''}
        onPick={picked}
        noMatch={(search) => (search ? t('recipe.review.pickNone', { search }) : t('recipe.review.pickEmpty'))}
        finalFocus={finalFocus}
        extra={
          <button type="button" className={buttonClass({ variant: 'pencil' }, 'review-new')} onClick={newIngredient}>
            {t('recipes.newIngredient')}
          </button>
        }
      />
      {createPortal(
        <Sheet
          open={creating.open}
          onClose={() => setCreating((c) => ({ ...c, open: false }))}
          title={t('ingredients.new')}
          finalFocus={finalFocus}
          fullScreen
        >
          {/* The form is drawn outside the page, but React still passes its
              submit up to the recipe's form around the review. */}
          <div className="review-new-form" onSubmit={(event: FormEvent) => event.stopPropagation()}>
            {creating.open ? (
              <IngredientForm
                id={null}
                initialName={food.charAt(0).toUpperCase() + food.slice(1)}
                inSheet
                onSaved={created}
              />
            ) : null}
          </div>
        </Sheet>,
        document.body,
      )}
    </>
  )

  return { needs, banner, line, sheets, refuse }
}
