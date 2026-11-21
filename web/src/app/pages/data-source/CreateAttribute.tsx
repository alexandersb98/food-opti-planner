import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api } from '../../../api/client'
import { fieldErrors } from '../../../api/errors'
import type { Attribute, SourceColumn } from '../../../api/types'
import { DECIMALS, decimalsExample, parseDecimals } from '../../../attributeFields'
import { usePreferences } from '../../hooks/usePreferences'
import { useUnits } from '../../hooks/useUnits'
import { useT } from '../../i18n/i18n'
import { preferredUnit } from '../../stores/preferences'
import { Field } from '../../ui/field/Field'
import { Sheet } from '../../ui/sheet/Sheet'
import { UnitField, type UnitGroup } from '../../ui/unit-field/UnitField'
import './create-attribute.css'
import { buttonClass } from '../../ui/button/Button'

interface Errors {
  name?: string
  unit?: string
  decimals?: string
  save?: string
}

/**
 * Create attribute, from a column's Attribute choice: a small sheet with a
 * name, a unit of the column's kind (starting at the preferred unit of that
 * kind, or the column's own unit for one in free text) and decimals. Add
 * creates the attribute and hands it to `onCreated`, which maps the column;
 * the sheet then closes. Mount it afresh (a new `key`) for each opening, so
 * it opens with a fresh form.
 */
export function CreateAttribute({
  open,
  column,
  onClose,
  onCreated,
}: {
  open: boolean
  column: SourceColumn
  onClose: () => void
  onCreated: (attribute: Attribute) => void
}) {
  const t = useT()
  const { findUnit, convertible } = useUnits()
  const { preferences } = usePreferences()
  const nameRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [name, setName] = useState('')
  // null until the reader changes it: the start unit follows the catalogue
  // and the preferences, which may arrive after the sheet opened.
  const [typedUnit, setTypedUnit] = useState<string | null>(null)
  const [decimals, setDecimals] = useState(String(DECIMALS.default))
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  // Counts the adds refused with a field message; each moves focus to the
  // first such field.
  const [refusals, setRefusals] = useState(0)

  useEffect(() => {
    if (refusals > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [refusals])

  const category = findUnit(column.unit)?.category ?? null
  const kinds: readonly UnitGroup[] = category ? [category] : []
  const unit = typedUnit ?? (category ? preferredUnit(preferences, category) : undefined) ?? column.unit

  const example = decimalsExample(parseDecimals(decimals), unit)

  async function add(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    const trimmedName = name.trim()
    const trimmedUnit = unit.trim()
    const places = parseDecimals(decimals)
    const found: Errors = {
      name: trimmedName ? undefined : t('common.nameRequired'),
      unit: convertible(column.unit, trimmedUnit) ? undefined : t('dataSource.createUnitMismatch', { unit: column.unit }),
      decimals: places === null ? t('attributes.decimalsRange', { min: DECIMALS.min, max: DECIMALS.max }) : undefined,
    }
    setErrors(found)
    if (found.name || found.unit || found.decimals || places === null) {
      setRefusals((n) => n + 1)
      return
    }

    setSaving(true)
    let save: Errors = {}
    try {
      const { data, error } = await api.POST('/api/attributes', { body: { name: trimmedName, unit: trimmedUnit, decimals: places } })
      if (data) {
        onCreated(data)
        return
      }
      save = fieldErrors(error).name === 'name_in_use' ? { name: t('attributes.nameInUse') } : { save: t('common.saveFailed') }
    } catch {
      save = { save: t('common.saveFailed') }
    } finally {
      setSaving(false)
    }
    setErrors(save)
    if (save.name) setRefusals((n) => n + 1)
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('dataSource.newAttribute')} initialFocus={nameRef}>
      <form ref={formRef} className="ds-create" noValidate aria-busy={saving || undefined} onSubmit={(event) => void add(event)}>
        <p className="sheet-preview">{t('dataSource.createLead', { column: column.name })}</p>
        <Field label={t('common.name')} error={errors.name}>
          {(control) => (
            <input
              {...control}
              ref={nameRef}
              name="name"
              className="ds-create-name"
              value={name}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <div className="ds-create-row">
          <UnitField
            label={t('attributes.unit')}
            hint={column.unit ? t('dataSource.createUnitHint', { unit: column.unit }) : undefined}
            error={errors.unit}
            name="unit"
            value={unit}
            kinds={kinds}
            onChange={setTypedUnit}
          />
          <Field
            label={t('attributes.decimals')}
            hint={example ? t('attributes.precisionHint', { example }) : t('attributes.precisionHintPlain')}
            error={errors.decimals}
          >
            {(control) => (
              <input
                {...control}
                name="decimals"
                className="ds-create-decimals num"
                value={decimals}
                inputMode="numeric"
                autoComplete="off"
                onChange={(event) => setDecimals(event.target.value)}
              />
            )}
          </Field>
        </div>
        {errors.save ? (
          <p className="ds-create-error" role="alert">
            {errors.save}
          </p>
        ) : null}
        <div className="sheet-actions">
          <button type="button" className={buttonClass({ variant: 'ghost' })} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={buttonClass({ variant: 'primary' })} disabled={saving}>
            {saving ? t('attributes.saving') : t('dataSource.add')}
          </button>
        </div>
      </form>
    </Sheet>
  )
}
