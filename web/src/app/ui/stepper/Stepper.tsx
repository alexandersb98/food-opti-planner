import type { ReactNode } from 'react'
import './stepper.css'

/** The next value one step down (-1) or up (+1): a fixed step, or a
 * function for uneven steps (5, 10, 15, 30, 60 … seconds). */
export type StepBy = number | ((value: number, direction: -1 | 1) => number)

function next(value: number, direction: -1 | 1, step: StepBy, min: number, max: number) {
  const raw = typeof step === 'function' ? step(value, direction) : value + direction * step
  return Math.min(max, Math.max(min, raw))
}

/**
 * − value + in D2's look: two 44 px buttons around the value. The value is
 * announced politely when it changes; a button is disabled at its end.
 *
 * ```tsx
 * <Stepper label={t('schedule.days')} decreaseLabel={t('schedule.fewerDays')}
 *   increaseLabel={t('schedule.moreDays')} value={days} min={1} max={14} onChange={setDays} />
 * ```
 */
export function Stepper({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  label,
  labelledBy,
  decreaseLabel,
  increaseLabel,
  format,
  disabled = false,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: StepBy
  /** The group's name ("Days"); or name it by a visible heading with `labelledBy`. */
  label?: string
  labelledBy?: string
  /** The buttons' names, e.g. "Fewer days" and "More days". */
  decreaseLabel: string
  increaseLabel: string
  /** How the value shows, e.g. `(s) => t('plan.seconds', { n: s })`. */
  format?: (value: number) => ReactNode
  disabled?: boolean
}) {
  const down = next(value, -1, step, min, max)
  const up = next(value, 1, step, min, max)
  return (
    <div className="stepper" role="group" aria-label={label} aria-labelledby={labelledBy} data-no-swipe="">
      <button
        type="button"
        className="stepper-button"
        aria-label={decreaseLabel}
        disabled={disabled || down >= value}
        onClick={() => onChange(down)}
      >
        <span aria-hidden="true">−</span>
      </button>
      <output className="stepper-value" aria-live="polite">
        {format ? format(value) : value}
      </output>
      <button
        type="button"
        className="stepper-button"
        aria-label={increaseLabel}
        disabled={disabled || up <= value}
        onClick={() => onChange(up)}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  )
}
