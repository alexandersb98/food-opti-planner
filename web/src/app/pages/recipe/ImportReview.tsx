import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useBlocker } from 'react-router'
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
import { useConfirm } from '../../ui/confirm/Confirm'
import { Sheet } from '../../ui/sheet/Sheet'
import { IngredientForm } from '../ingredient/IngredientForm'
import { IngredientPicker } from './IngredientPicker'
import * as review from './reviewEdits'
import type { LineErrorsCleared } from './useRecipeDraft'
import './import-review.css'

// The import review (ticket 35): an imported recipe opens as a new spread in
// edit mode, with a banner above the head saying where it came from and how
// many lines need the owner, and each imported line showing its source text
// and what it needs (pick an ingredient, give a factor, pick another unit, or
// skip). The pure rules are `src/importReview.ts`; the draft's changes are
// `reviewEdits.ts`, run through useRecipeDraft's `edit`.

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

/** The ids the review moves the focus to. */
const ids = {
  amount: (key: number) => `line-${key}-amount`,
  pick: (key: number) => `review-${key}-pick`,
  factor: (key: number) => `review-${key}-factor`,
  change: (key: number) => `review-${key}-change`,
  unskip: (key: number) => `review-${key}-unskip`,
}

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

  const banner = <Banner site={imported.site} cut={imported.cut} needs={needs} refused={refused} onNext={showNext} />
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
          <button type="button" className="review-new" onClick={newIngredient}>
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

/** The banner above the head: where the recipe came from, how many lines
 * need the owner (with a way to the next), that the end was left out, and
 * that Save waits for every line. */
function Banner({
  site,
  cut,
  needs,
  refused,
  onNext,
}: {
  site: string
  cut: boolean
  needs: number
  refused: number
  onNext: () => void
}) {
  const t = useT()
  const text = site
    ? needs > 0
      ? t('recipes.bannerSite', { site, n: needs }, needs)
      : t('recipes.bannerSiteReady', { site })
    : needs > 0
      ? t('recipes.banner', { n: needs }, needs)
      : t('recipes.bannerReady')
  return (
    <div className={needs > 0 ? 'review-banner' : 'review-banner review-banner-ready'}>
      <p className="review-banner-kicker">{t('recipe.review.kicker')}</p>
      <p className="review-banner-text" aria-live="polite">
        {text}
      </p>
      {cut ? <p className="review-banner-cut">{t('recipes.bannerCut')}</p> : null}
      {needs > 0 ? (
        <>
          {refused > 0 ? (
            <p key={refused} className="review-banner-block" role="alert">
              {t('recipes.saveBlocked')}
            </p>
          ) : (
            <p className="review-banner-block">{t('recipes.saveBlocked')}</p>
          )}
          <button type="button" className="review-next" onClick={onNext}>
            {t('recipe.review.next')}
          </button>
        </>
      ) : null}
    </div>
  )
}

/** What one line needs, under it: Pick ingredient and Skip; the factor
 * ("1 dl = [50] g ✨ Accept", or "1 dl = 50 g ✨ Change" once accepted); a
 * unit that can't be used; or, for a skipped line, Add anyway or Add back. */
function ReviewPanel({
  line,
  state,
  factor,
  own,
  name,
  named,
  onPick,
  onSkip,
  onAccept,
  onChange,
  onType,
}: {
  line: DraftLine
  state: LineState
  factor: FactorRow | null
  own: string
  name: string
  named: (action: string) => string
  onPick: () => void
  onSkip: (skipped: boolean) => void
  onAccept: (text: string) => void
  onChange: () => void
  onType: (text: string) => void
}) {
  const t = useT()
  const { key } = line
  const skipButton = (
    <button
      type="button"
      className="review-btn review-btn-quiet"
      aria-label={named(t('recipes.skip'))}
      onClick={() => onSkip(true)}
    >
      {t('recipes.skip')}
    </button>
  )
  const ai = (
    <span className="review-ai" role="img" aria-label={t('recipes.aiTooltip')} title={t('recipes.aiTooltip')}>
      ✨
    </span>
  )

  if (state === 'skipped') {
    const label = line.notAnIngredient ? t('recipes.addAnyway') : t('recipes.addBack')
    return (
      <div className="review-panel review-panel-skipped">
        <span className="review-skipped-note">
          {line.notAnIngredient ? t('recipe.review.notAnIngredient') : t('recipes.skipped')}
        </span>
        <button
          type="button"
          id={ids.unskip(key)}
          className="review-btn review-btn-text"
          aria-label={named(label)}
          onClick={() => onSkip(false)}
        >
          {label}
        </button>
      </div>
    )
  }

  if (state === 'unmatched') {
    return (
      <div className="review-panel">
        <p className="review-why">
          <strong>{t('recipe.review.needs')}</strong>{' '}
          {t('recipe.review.unmatched', { food: line.food || line.originalText })}
        </p>
        <div className="review-actions">
          <button
            type="button"
            id={ids.pick(key)}
            className="review-btn"
            aria-label={named(t('recipes.pickIngredient'))}
            onClick={onPick}
          >
            {t('recipes.pickIngredient')}
          </button>
          {skipButton}
        </div>
      </div>
    )
  }

  if (factor?.accepted) {
    return (
      <div className="review-panel review-panel-settled">
        <p className="review-fix">
          <span>{t('recipes.factorRow', { unit: line.unit.trim() })}</span>{' '}
          <span className="review-factor-value">{`${factor.text} ${own}`}</span>
          {factor.ai ? <> {ai}</> : null}
          <button
            type="button"
            id={ids.change(key)}
            className="review-btn review-btn-text"
            aria-label={named(t('recipes.change'))}
            onClick={onChange}
          >
            {t('recipes.change')}
          </button>
        </p>
      </div>
    )
  }

  if (state === 'bad_unit') {
    return (
      <div className="review-panel">
        <p className="review-why">
          <strong>{t('recipe.review.needs')}</strong> {t('recipes.badUnit', { unit: line.unit.trim() })}
        </p>
        <div className="review-actions">{skipButton}</div>
      </div>
    )
  }

  if (state === 'needs_factor' && factor) {
    const invalid = factor.text !== '' && acceptable(factor.text) === null
    const errorId = `${ids.factor(key)}-error`
    return (
      <div className="review-panel">
        <p className="review-why">
          <strong>{t('recipe.review.needs')}</strong>{' '}
          {t('recipe.review.noFactor', { unit: line.unit.trim(), name: name.toLowerCase() })}
        </p>
        <div className="review-fix">
          <span aria-hidden="true">{t('recipes.factorRow', { unit: line.unit.trim() })}</span>
          <input
            id={ids.factor(key)}
            className="spread-annot review-factor"
            inputMode="decimal"
            autoComplete="off"
            aria-label={t('recipes.factorLabel', { own, unit: line.unit.trim() })}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={invalid ? errorId : undefined}
            readOnly={factor.loading}
            placeholder={factor.loading ? t('recipes.suggesting') : undefined}
            value={factor.text}
            onChange={(event) => onType(event.target.value)}
            onKeyDown={(event) => {
              // Enter accepts the number; it never submits the recipe.
              if (event.key !== 'Enter') return
              event.preventDefault()
              if (!factor.loading && acceptable(factor.text) !== null) onAccept(factor.text)
            }}
          />
          <span translate="no">{own}</span>
          {factor.ai && factor.text ? ai : null}
          <button
            type="button"
            className="review-btn"
            aria-label={named(t('recipes.accept'))}
            disabled={factor.loading || acceptable(factor.text) === null}
            onClick={() => onAccept(factor.text)}
          >
            {t('recipes.accept')}
          </button>
        </div>
        {invalid ? (
          <p id={errorId} className="field-error review-error">
            {t('recipes.factorInvalid')}
          </p>
        ) : null}
        <div className="review-actions">{skipButton}</div>
      </div>
    )
  }

  return null
}

/**
 * Leaving an imported recipe before it is saved asks "Discard this
 * recipe?" (Keep editing / Discard), and a reload or a closed tab warns.
 * `done` is set once the recipe is saved (or discarded), so its own
 * navigation goes straight on.
 */
export function LeaveGuard({ done }: { done: RefObject<boolean> }) {
  const t = useT()
  const [confirm, confirmSheet] = useConfirm()
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => !done.current && currentLocation.pathname !== nextLocation.pathname,
  )
  const asking = useRef(false)

  useEffect(() => {
    if (blocker.state !== 'blocked' || asking.current) return
    asking.current = true
    void confirm({
      title: t('recipes.leaveTitle'),
      message: <p>{t('recipes.leaveBody')}</p>,
      confirmLabel: t('recipes.discard'),
      cancelLabel: t('recipes.keepEditing'),
      destructive: true,
    }).then((discard) => {
      asking.current = false
      if (discard) {
        done.current = true
        blocker.proceed()
      } else blocker.reset()
    })
  }, [blocker, confirm, done, t])

  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (!done.current) event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [done])

  return confirmSheet
}
