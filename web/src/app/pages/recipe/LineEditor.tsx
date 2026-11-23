import { memo, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Conversion, Ingredient } from '../../../api/types'
import type { PendingConversion } from '../../../importReview'
import { newKey, plainLine, type DraftLine, type DraftSection, type RecipeDraft, type RecipeErrors } from '../../../recipeDraft'
import { useUnits } from '../../hooks/useUnits'
import { useT } from '../../i18n/i18n'
import { toast } from '../../shell/toast'
import { buttonClass } from '../../ui/button/Button'
import { Sheet } from '../../ui/sheet/Sheet'
import { ConversionSheet } from '../ingredient/ConversionSheet'
import type { LineReview } from './ImportReview'
import { IngredientPicker } from './IngredientPicker'
import * as lines from './lineEdits'
import { focusTarget, lineIds as ids } from './lineFocus'
import { LineRow } from './LineRow'
import type { LineErrorsCleared } from './useRecipeDraft'
import './line-editor.css'

export interface LineEditorProps {
  sections: readonly DraftSection[]
  /** Conversions accepted in an import review, counted as the ingredient's. */
  pending: readonly PendingConversion[]
  errors: RecipeErrors
  ingredients: ReadonlyMap<number, Ingredient>
  /** useRecipeDraft's `edit`. */
  edit: (change: (draft: RecipeDraft) => RecipeDraft, clears?: LineErrorsCleared) => void
  /** An ingredient gained a conversion ("New unit…"). */
  onIngredientChanged: (ingredient: Ingredient) => void
  /** An imported recipe under review (ticket 35): what each line needs. */
  review?: (line: DraftLine, name: string) => LineReview
}

/**
 * The ingredient lines in edit mode (D2's annotated lines): per section an
 * optional heading, each line's amount, unit, name and ×, "Add a line" and
 * (with several sections) a heading to fill and "Remove this section"; "Add
 * a section" at the end. A line's unit is picked from the ingredient's own,
 * the catalogue units that convert and its conversions; "New unit…" adds a
 * conversion. A line whose unit doesn't convert says why.
 */
export const LineEditor = memo(function LineEditor({
  sections,
  pending,
  errors,
  ingredients,
  edit,
  onIngredientChanged,
  review,
}: LineEditorProps) {
  const t = useT()
  const units = useUnits()
  // The sheets keep what they were opened for while they slide away.
  const [picker, setPicker] = useState({ open: false, section: sections[0]!.key })
  const [menu, setMenu] = useState({ open: false, line: 0 })
  const [unitSheet, setUnitSheet] = useState<{ open: boolean; line: number; ingredient: Ingredient; unit?: string } | null>(null)
  // Where the focus goes once the page shows a change (a new line's amount,
  // a new section's heading); the sheets' final focus reads it too.
  const [focus] = useState(focusTarget)
  useEffect(() => {
    // Most renders ask for no focus; the page is looked at only when one is.
    if (!focus.wanted()) return
    // A closing sheet gives the focus itself (the page is inert under it).
    if (document.querySelector('dialog[open]')) return
    const target = focus.take()
    target?.focus({ preventScroll: true })
    target?.scrollIntoView?.({ block: 'center' })
  })

  const several = sections.length > 1
  const labelOf = (section: DraftSection, index: number) => section.name.trim() || t('recipes.sectionN', { n: index + 1 })
  const ingredientList = useMemo(() => [...ingredients.values()], [ingredients])
  const named = (line: DraftLine) => (line.ingredientId === null ? undefined : ingredients.get(line.ingredientId))
  const nameOf = (line: DraftLine) => named(line)?.name ?? (line.food || line.originalText || t('recipe.missingName'))

  // The line the menu is open for, and its section.
  const menuSection = sections.findIndex((section) => section.items.some((line) => line.key === menu.line))
  const menuLine = sections[menuSection]?.items.find((line) => line.key === menu.line)

  function pick(ingredient: Ingredient) {
    const line = plainLine(ingredient.id, '', '', '')
    focus.set(ids.amount(line.key))
    edit((draft) => lines.addLine(draft, picker.section, line), { items: true })
    setPicker((p) => ({ ...p, open: false }))
  }

  function removeLine(section: DraftSection, line: DraftLine) {
    focus.set(ids.add(section.key))
    edit((draft) => lines.removeLine(draft, line.key))
    toast(t('recipe.removed', { name: nameOf(line) }))
  }

  function move(to: DraftSection, index: number) {
    if (!menuLine) return
    focus.set(ids.more(menuLine.key))
    edit((draft) => lines.moveLine(draft, menuLine.key, to.key))
    setMenu((m) => ({ ...m, open: false }))
    toast(t('recipe.moved', { name: nameOf(menuLine), section: labelOf(to, index) }))
  }

  function addSection() {
    const section: DraftSection = { key: newKey(), name: '', items: [] }
    // With one section so far, its heading is asked for first.
    focus.set(ids.name(several ? section.key : sections[0]!.key))
    edit((draft) => lines.addSection(draft, section))
  }

  function removeSection(index: number) {
    const section = sections[index]!
    focus.set(ids.add(sections[index > 0 ? index - 1 : 1]!.key))
    edit((draft) => lines.removeSection(draft, section.key), { sectionNames: section.key })
  }

  function conversionSaved(saved: Conversion) {
    if (!unitSheet) return
    const { ingredient, line } = unitSheet
    const conversions = [...ingredient.conversions.filter((c) => c.id !== saved.id), saved].sort((a, b) => a.id - b.id)
    onIngredientChanged({ ...ingredient, conversions })
    edit((draft) => lines.changeLine(draft, line, { unit: saved.unit }), { unitErrors: line })
    setUnitSheet((s) => s && { ...s, open: false })
    toast(t('recipe.conversionAdded', { unit: saved.unit, factor: saved.factor, own: ingredient.unit }))
  }

  return (
    <div className="lines">
      {sections.map((section, index) => (
        <div
          key={section.key}
          className="lines-section"
          role={several ? 'group' : undefined}
          aria-label={several ? labelOf(section, index) : undefined}
        >
          {several || section.name !== '' ? (
            <SectionName
              section={section}
              index={index}
              error={errors.sectionNames[section.key]}
              onChange={(name) => edit((draft) => lines.renameSection(draft, section.key, name), { sectionNames: section.key })}
            />
          ) : null}
          {section.items.length > 0 ? (
            <ul className="lines-list">
              {section.items.map((line) => (
                <LineRow
                  key={line.key}
                  line={line}
                  name={nameOf(line)}
                  ingredient={named(line)}
                  pending={pending}
                  errors={errors}
                  canMove={several}
                  units={units}
                  review={review?.(line, nameOf(line))}
                  onAmount={(amount) => edit((draft) => lines.changeLine(draft, line.key, { amount }), { amounts: line.key })}
                  onUnit={(unit) => edit((draft) => lines.changeLine(draft, line.key, { unit }), { unitErrors: line.key })}
                  onNewUnit={(ingredient, stale) =>
                    setUnitSheet({ open: true, line: line.key, ingredient, unit: stale ? line.unit.trim() : undefined })
                  }
                  onMenu={() => setMenu({ open: true, line: line.key })}
                  onRemove={() => removeLine(section, line)}
                />
              ))}
            </ul>
          ) : (
            <p className="lines-none">{t('recipe.noLines')}</p>
          )}
          <div className="lines-actions">
            <button
              type="button"
              id={ids.add(section.key)}
              className={buttonClass({ variant: 'pencil' })}
              onClick={() => setPicker({ open: true, section: section.key })}
            >
              {several || section.name.trim() ? t('recipe.addLineTo', { section: labelOf(section, index) }) : t('recipe.addLine')}
            </button>
            {several ? (
              <button type="button" className={buttonClass({ variant: 'pencil' }, 'lines-quiet')} onClick={() => removeSection(index)}>
                {t('recipe.removeSection')}
                <span className="visually-hidden">{`: ${labelOf(section, index)}. ${t('recipe.removeSectionHint')}`}</span>
              </button>
            ) : null}
          </div>
        </div>
      ))}
      <button type="button" className={buttonClass({ variant: 'pencil' }, 'lines-add-section')} onClick={addSection}>
        {t('recipe.addSection')}
      </button>

      <IngredientPicker
        open={picker.open}
        onClose={() => setPicker((p) => ({ ...p, open: false }))}
        title={(() => {
          const index = sections.findIndex((s) => s.key === picker.section)
          const section = sections[index]
          return section && (several || section.name.trim())
            ? t('recipe.pickTitleTo', { section: labelOf(section, index) })
            : t('recipe.pickTitle')
        })()}
        ingredients={ingredientList}
        onPick={pick}
        finalFocus={focus.ref}
      />

      {createPortal(
        <Sheet
          open={menu.open && !!menuLine}
          onClose={() => setMenu((m) => ({ ...m, open: false }))}
          title={t('recipe.lineMenuTitle', { name: menuLine ? nameOf(menuLine) : '' })}
          finalFocus={focus.ref}
        >
          <p className="lines-menu-hint">{t('recipe.lineMenuHint')}</p>
          <ul className="picker-list">
            {sections.map((section, index) =>
              index === menuSection ? null : (
                <li key={section.key}>
                  <button type="button" className="picker-row" onClick={() => move(section, index)}>
                    <span className="picker-name">{t('recipes.moveTo', { section: labelOf(section, index) })}</span>
                  </button>
                </li>
              ),
            )}
          </ul>
        </Sheet>,
        document.body,
      )}

      {unitSheet ? (
        <ConversionSheet
          open={unitSheet.open}
          ingredient={unitSheet.ingredient}
          unit={unitSheet.unit}
          onSaved={conversionSaved}
          onClose={() => setUnitSheet((s) => s && { ...s, open: false })}
        />
      ) : null}
    </div>
  )
})

function SectionName({
  section,
  index,
  error,
  onChange,
}: {
  section: DraftSection
  index: number
  error?: string
  onChange: (name: string) => void
}) {
  const t = useT()
  const id = ids.name(section.key)
  return (
    <div className="lines-heading">
      <label className="visually-hidden" htmlFor={id}>
        {t('recipe.sectionName', { n: index + 1 })}
      </label>
      <input
        id={id}
        className="annot lines-heading-in"
        autoComplete="off"
        placeholder={t('recipe.sectionPlaceholder')}
        value={section.name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
