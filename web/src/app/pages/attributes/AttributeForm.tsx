import { useEffect, useRef } from 'react'
import { decimalsExample, parseDecimals } from '../../../attributeFields'
import { useT } from '../../i18n/i18n'
import { Button } from '../../ui/button/Button'
import { Field } from '../../ui/field/Field'
import { UnitField, type UnitGroup } from '../../ui/unit-field/UnitField'

/** An attribute as typed: decimals is text while typed, so it can be empty. */
export interface Draft {
  name: string
  unit: string
  decimals: string
}

/** A message per field, and `save` for the entry as a whole. */
export interface DraftErrors {
  name?: string
  unit?: string
  decimals?: string
  save?: string
}

/** An attribute's unit is a mass, a volume, an energy or typed (never a piece). */
const KINDS: readonly UnitGroup[] = ['mass', 'volume', 'energy']

/**
 * The open entry of the list, annotated in red pencil: name, unit and
 * decimals. Submitting (Done, or Enter in a field) closes it, which saves.
 */
export function AttributeForm({
  label,
  draft,
  errors,
  isNew,
  busy,
  refusals,
  onChange,
  onDone,
  onCancel,
  onDelete,
}: {
  /** The form's accessible name ("Editing Protein"). */
  label: string
  draft: Draft
  errors: DraftErrors
  isNew: boolean
  /** A save or delete is under way. */
  busy: 'saving' | 'deleting' | null
  /** Counts the closes refused with a field message; each moves focus to
   * the first such field. */
  refusals: number
  onChange: (change: Partial<Draft>) => void
  onDone: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  const t = useT()
  const nameRef = useRef<HTMLInputElement>(null)

  const formRef = useRef<HTMLFormElement>(null)

  // The entry opens ready to type in.
  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  // After a refused close, to the first field with a message.
  useEffect(() => {
    if (refusals > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [refusals])

  const example = decimalsExample(parseDecimals(draft.decimals), draft.unit)
  const precision = example ? t('attributes.precisionHint', { example }) : t('attributes.precisionHintPlain')

  return (
    <form
      ref={formRef}
      className="attributes-form"
      aria-label={label}
      aria-busy={busy ? true : undefined}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        onDone()
      }}
    >
      <Field label={t('common.name')} error={errors.name} className="attributes-field-name">
        {(control) => (
          <input
            {...control}
            ref={nameRef}
            name="name"
            className="annot attributes-name-input"
            value={draft.name}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        )}
      </Field>
      <div className="attributes-form-row">
        <UnitField
          className="attributes-field-unit"
          label={t('attributes.unit')}
          hint={t('attributes.unitHint')}
          error={errors.unit}
          name="unit"
          value={draft.unit}
          kinds={KINDS}
          onChange={(unit) => onChange({ unit })}
        />
        <Field label={t('attributes.decimals')} hint={precision} error={errors.decimals} className="attributes-field-decimals">
          {(control) => (
            <input
              {...control}
              className="annot attributes-decimals-input"
              name="decimals"
              value={draft.decimals}
              inputMode="numeric"
              autoComplete="off"
              onChange={(event) => onChange({ decimals: event.target.value })}
            />
          )}
        </Field>
      </div>
      {errors.save ? (
        <p className="attributes-save-error" role="alert">
          {errors.save}
        </p>
      ) : null}
      <div className="attributes-actions">
        {isNew ? (
          <Button variant="ghost" small onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        ) : (
          <Button variant="text" onClick={onDelete}>
            {t('common.delete')}
          </Button>
        )}
        <Button type="submit" variant="primary" small>
          {busy === 'saving' ? t('attributes.saving') : t('common.done')}
        </Button>
      </div>
    </form>
  )
}
