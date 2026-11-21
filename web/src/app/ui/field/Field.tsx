import { useId, type ReactNode } from 'react'
import './field.css'

/** What a field's control needs to be labelled, described and marked
 * invalid: spread it on the input, textarea or select. */
export interface FieldControl {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
}

/** The ids of the hint and error lines that exist, for aria-describedby. */
function describedBy(hintId: string, errorId: string, hint: ReactNode, error: ReactNode) {
  const ids = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ')
  return ids || undefined
}

/**
 * A labelled control with an optional hint and error. The control is
 * rendered by the child function, which gets the wiring to spread on it:
 *
 * ```tsx
 * <Field label={t('common.name')} hint={t('…')} error={errors.name}>
 *   {(control) => <input {...control} value={name} onChange={(e) => setName(e.target.value)} />}
 * </Field>
 * ```
 *
 * The hint and error describe the control (`aria-describedby`); an error
 * sets `aria-invalid`, is announced when it appears, and replaces nothing:
 * the hint stays.
 */
export function Field({
  label,
  hint,
  error,
  hideLabel = false,
  id,
  className,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  /** The message, or nothing when the value is fine. */
  error?: ReactNode
  /** Keeps the label for screen readers only (e.g. a field in a table row). */
  hideLabel?: boolean
  /** The control's id, if the page needs to know it; generated otherwise. */
  id?: string
  className?: string
  children: (control: FieldControl) => ReactNode
}) {
  const generated = useId()
  const controlId = id ?? `field${generated}`
  const hintId = `${controlId}-hint`
  const errorId = `${controlId}-error`
  const control: FieldControl = { id: controlId }
  const description = describedBy(hintId, errorId, hint, error)
  if (description) control['aria-describedby'] = description
  if (error) control['aria-invalid'] = true

  return (
    <div className={className ? `field ${className}` : 'field'}>
      <label className={hideLabel ? 'visually-hidden' : 'field-label'} htmlFor={controlId}>
        {label}
      </label>
      {children(control)}
      {hint ? (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * A group of controls under one legend, with an optional hint and error
 * describing the group: for Segmented, Chips, Stepper or a row of fields.
 *
 * ```tsx
 * <Fieldset legend={t('goals.editor.strictness')}>
 *   <Segmented value={strictness} options={…} onChange={setStrictness} />
 * </Fieldset>
 * ```
 */
export function Fieldset({
  legend,
  hint,
  error,
  className,
  children,
}: {
  legend: ReactNode
  hint?: ReactNode
  error?: ReactNode
  className?: string
  children: ReactNode
}) {
  const id = useId()
  const hintId = `fieldset${id}-hint`
  const errorId = `fieldset${id}-error`
  return (
    <fieldset
      className={className ? `field-set ${className}` : 'field-set'}
      aria-describedby={describedBy(hintId, errorId, hint, error)}
    >
      <legend className="field-label">{legend}</legend>
      {children}
      {hint ? (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  )
}
