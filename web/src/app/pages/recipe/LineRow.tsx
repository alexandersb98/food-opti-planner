import type { Ingredient } from '../../../api/types'
import { ingredientWithPending, type PendingConversion } from '../../../importReview'
import { lineFactor } from '../../../lineUnits'
import type { DraftLine, RecipeErrors } from '../../../recipeDraft'
import { useT } from '../../i18n/i18n'
import { buttonClass } from '../../ui/button/Button'
import type { LineReview } from './ImportReview'
import { lineIds as ids } from './lineFocus'
import { LineUnit, type Units } from './LineUnit'

/** One ingredient line in edit mode: its amount, unit, name, the line menu
 * (with several sections) and ×, with what is wrong with it under it and,
 * for an imported recipe, the review's part. */
export function LineRow({
  line,
  name,
  ingredient,
  pending,
  errors,
  canMove,
  units,
  review,
  onAmount,
  onUnit,
  onNewUnit,
  onMenu,
  onRemove,
}: {
  line: DraftLine
  name: string
  ingredient: Ingredient | undefined
  pending: readonly PendingConversion[]
  errors: RecipeErrors
  canMove: boolean
  units: Units
  /** The import review's part of the line, for an imported recipe. */
  review?: LineReview
  onAmount: (amount: string) => void
  onUnit: (unit: string) => void
  /** "New unit…": `stale` when the line's unit doesn't convert (the sheet
   * starts with it). */
  onNewUnit: (ingredient: Ingredient, stale: boolean) => void
  onMenu: () => void
  onRemove: () => void
}) {
  const t = useT()
  const { key } = line
  const amountError = errors.amounts[key]
  const ingredientError = errors.lineIngredients[key]
  // The unit as the line holds it, and whether it converts: without the
  // catalogue the page can't tell, so it says nothing (the server decides).
  const withPending = ingredient && ingredientWithPending(ingredient, pending)
  const known = units.units.length > 0
  // Under review, the review says what a line's unit needs.
  const stale = !review && !!withPending && known && lineFactor(units.ratio, withPending, line.unit) === null
  const skipped = review?.state === 'skipped'
  const needsYou = review?.state === 'unmatched' || review?.state === 'needs_factor' || review?.state === 'bad_unit'
  const unitError = errors.unitErrors[key] ? t('recipes.unitNotConvertible', { unit: line.unit.trim(), name }) : ''
  const amountErrorId = `${ids.amount(key)}-error`
  const unitNoteId = `${ids.unit(key)}-note`

  const classes = [
    'lines-line',
    stale || unitError ? 'lines-line-flagged' : '',
    ingredient ? '' : 'lines-line-missing',
    review ? 'review-line' : '',
    needsYou ? 'review-needs' : '',
    skipped ? 'review-skipped' : '',
  ]
  return (
    <li className={classes.filter(Boolean).join(' ')}>
      {review?.source}
      <input
        id={ids.amount(key)}
        className="annot lines-amount"
        inputMode="decimal"
        autoComplete="off"
        aria-label={t('recipes.amountOf', { name })}
        aria-invalid={amountError ? true : undefined}
        aria-describedby={amountError ? amountErrorId : undefined}
        disabled={skipped}
        value={line.amount}
        onChange={(event) => onAmount(event.target.value)}
      />
      {withPending ? (
        <LineUnit
          id={ids.unit(key)}
          line={line}
          ingredient={withPending}
          name={name}
          stale={stale}
          units={units}
          invalid={!!unitError}
          disabled={skipped}
          describedBy={stale || unitError ? unitNoteId : undefined}
          onUnit={onUnit}
          onNewUnit={() => onNewUnit(ingredient!, stale)}
        />
      ) : (
        <span className="lines-unit-text" translate="no">
          {line.unit}
        </span>
      )}
      <span className="lines-name">{name}</span>
      <span className="lines-tools">
        {canMove ? (
          <button type="button" id={ids.more(key)} className={buttonClass({ variant: 'icon' }, 'lines-icon')} aria-label={t('recipes.lineMenu', { name })} onClick={onMenu}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <circle cx="5" cy="12" r="1.6" fill="currentColor" />
              <circle cx="12" cy="12" r="1.6" fill="currentColor" />
              <circle cx="19" cy="12" r="1.6" fill="currentColor" />
            </svg>
          </button>
        ) : null}
        <button type="button" className={buttonClass({ variant: 'icon' }, 'lines-icon')} aria-label={t('recipes.remove', { name })} onClick={onRemove}>
          <span aria-hidden="true">×</span>
        </button>
      </span>
      {amountError ? (
        <p id={amountErrorId} className="field-error lines-note" role="alert">
          {amountError}
        </p>
      ) : null}
      {unitError ? (
        <p id={unitNoteId} className="field-error lines-note" role="alert">
          {unitError}
        </p>
      ) : stale ? (
        <p id={unitNoteId} className="lines-note lines-flag">
          {t('recipe.unconvertible', { unit: line.unit.trim(), own: ingredient!.unit })}
        </p>
      ) : null}
      {ingredientError ? (
        <p className="field-error lines-note" role="alert">
          {ingredientError}
        </p>
      ) : null}
      {!ingredient && line.ingredientId !== null ? <p className="lines-note lines-flag">{t('recipe.missing')}</p> : null}
      {review?.panel}
    </li>
  )
}
