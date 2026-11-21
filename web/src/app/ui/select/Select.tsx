import type { SelectHTMLAttributes } from 'react'
import './select.css'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectGroup {
  /** The group's heading in the list (an `<optgroup>`). */
  group: string
  options: readonly SelectOption[]
}

/**
 * A native select in D2's look, with options and option groups mixed in
 * order. Inside a `Field`, spread the control wiring on it:
 *
 * ```tsx
 * <Field label={t('…unit')}>
 *   {(control) => (
 *     <Select {...control} value={unit} onValueChange={setUnit}
 *       options={[{ value: '', label: '—' }, { group: 'Mass', options: [{ value: 'g', label: 'g' }] }]} />
 *   )}
 * </Field>
 * ```
 *
 * `annotation` gives the small inline look of D2's recipe annotations
 * (`select.annot`): serif, no rule, for a select inside a line of text.
 */
export function Select({
  value,
  options,
  onValueChange,
  annotation = false,
  className,
  ...props
}: {
  value: string
  options: readonly (SelectOption | SelectGroup)[]
  onValueChange: (value: string) => void
  annotation?: boolean
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange' | 'multiple'>) {
  const wrap = ['select', annotation ? 'select-annotation' : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <span className={wrap}>
      <select value={value} onChange={(event) => onValueChange(event.target.value)} {...props}>
        {options.map((entry) =>
          'group' in entry ? (
            <optgroup key={`group:${entry.group}`} label={entry.group}>
              {entry.options.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ) : (
            <option key={entry.value} value={entry.value} disabled={entry.disabled}>
              {entry.label}
            </option>
          ),
        )}
      </select>
    </span>
  )
}
