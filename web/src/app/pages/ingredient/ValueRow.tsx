import { useId } from 'react'
import type { Attribute } from '../../../api/types'

/** One attribute's value: its name, the number and the attribute's unit. */
export function ValueRow({
  attribute,
  value,
  error,
  onChange,
}: {
  attribute: Attribute
  value: string
  error: string | undefined
  onChange: (attributeId: number, text: string) => void
}) {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <div className="ingredient-value">
      <label htmlFor={id} className="ingredient-value-name">
        {attribute.name}
      </label>
      <input
        id={id}
        name={`value-${attribute.id}`}
        className="ingredient-number"
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        value={value}
        onChange={(event) => onChange(attribute.id, event.target.value)}
      />
      <span className="ingredient-unit" translate="no">
        {attribute.unit}
      </span>
      {error ? (
        <p id={errorId} className="field-error ingredient-value-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
