import type { ReactNode } from 'react'
import './segmented.css'

export interface SegmentedOption<V extends string> {
  value: V
  label: ReactNode
  disabled?: boolean
}

/**
 * One choice of a few, as a row of pressed buttons (D2's .seg): the chosen
 * one is pressed (`aria-pressed`), filled in ink.
 *
 * ```tsx
 * <Segmented label={t('goals.editor.strictness')} value={strictness} onChange={setStrictness}
 *   options={[{ value: 'must', label: t('goals.must') }, { value: 'prefer', label: t('goals.prefer') }]} />
 * ```
 *
 * Name the group with `label`, or `labelledBy` a visible heading, or leave
 * both out inside a `Fieldset`, whose legend names it.
 */
export function Segmented<V extends string>({
  value,
  options,
  onChange,
  label,
  labelledBy,
  compact = false,
  className,
}: {
  /** The chosen value; none is pressed if it matches no option. */
  value: V | null
  options: readonly SegmentedOption<V>[]
  onChange: (value: V) => void
  label?: string
  labelledBy?: string
  /** Smaller type and padding, for a row beside a name (e.g. a filter row). */
  compact?: boolean
  className?: string
}) {
  const classes = ['seg', compact ? 'seg-compact' : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <div className={classes} role="group" aria-label={label} aria-labelledby={labelledBy} data-no-swipe="">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="seg-button"
          aria-pressed={option.value === value}
          disabled={option.disabled}
          onClick={() => {
            if (option.value !== value) onChange(option.value)
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
