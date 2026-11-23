import { acceptable, type FactorRow, type LineState } from '../../../importReview'
import type { DraftLine } from '../../../recipeDraft'
import { useT } from '../../i18n/i18n'
import { buttonClass } from '../../ui/button/Button'

/** The ids the review moves the focus to. */
export const reviewIds = {
  amount: (key: number) => `line-${key}-amount`,
  pick: (key: number) => `review-${key}-pick`,
  factor: (key: number) => `review-${key}-factor`,
  change: (key: number) => `review-${key}-change`,
  unskip: (key: number) => `review-${key}-unskip`,
}
/** What one line needs, under it: Pick ingredient and Skip; the factor
 * ("1 dl = [50] g ✨ Accept", or "1 dl = 50 g ✨ Change" once accepted); a
 * unit that can't be used; or, for a skipped line, Add anyway or Add back. */
export function ReviewPanel({
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
      className={buttonClass({ small: true }, 'review-btn review-btn-quiet')}
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
          id={reviewIds.unskip(key)}
          className={buttonClass({ variant: 'pencil' }, 'review-btn-text')}
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
            id={reviewIds.pick(key)}
            className={buttonClass({ small: true }, 'review-btn')}
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
            id={reviewIds.change(key)}
            className={buttonClass({ variant: 'pencil' }, 'review-btn-text')}
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
    const errorId = `${reviewIds.factor(key)}-error`
    return (
      <div className="review-panel">
        <p className="review-why">
          <strong>{t('recipe.review.needs')}</strong>{' '}
          {t('recipe.review.noFactor', { unit: line.unit.trim(), name: name.toLowerCase() })}
        </p>
        <div className="review-fix">
          <span aria-hidden="true">{t('recipes.factorRow', { unit: line.unit.trim() })}</span>
          <input
            id={reviewIds.factor(key)}
            className="annot review-factor"
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
            className={buttonClass({ small: true }, 'review-btn')}
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
