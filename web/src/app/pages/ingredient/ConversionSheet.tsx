import { useId, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../../../api/client'
import { fieldErrors } from '../../../api/errors'
import type { Conversion, Ingredient } from '../../../api/types'
import { typedNumber } from '../../../numbers'
import { useT } from '../../i18n/i18n'
import { Field } from '../../ui/field/Field'
import { Sheet } from '../../ui/sheet/Sheet'
import { UnitField, type UnitGroup } from '../../ui/unit-field/UnitField'
import './conversions.css'
import { buttonClass } from '../../ui/button/Button'

// The conversion sheet: "1 [unit] = [number] g" for one ingredient, added or
// edited, saved at once through the API. Reusable: the ingredient page's
// conversions open it, and so does a recipe line's "New unit…" (ticket 33):
//
//   <ConversionSheet open={open} ingredient={food} unit="dl"
//     onSaved={(conversion) => { setOpen(false); use(conversion) }}
//     onClose={() => setOpen(false)} />
//
// It refuses the ingredient's own unit, a duplicate and a bad number, each on
// its field; a conversion that recipes use keeps its unit (only the number
// can change). The sheet is drawn at the end of the body, so it can be opened
// from inside another form.

export interface ConversionSheetProps {
  open: boolean
  /** The reader closed the sheet without saving; set `open` to false. */
  onClose: () => void
  ingredient: Pick<Ingredient, 'id' | 'name' | 'unit'>
  /** The conversion to edit; none adds a new one. */
  conversion?: Conversion | null
  /** A new conversion's starting unit (a recipe line's unit). */
  unit?: string
  /** After a save, with the stored conversion; set `open` to false. */
  onSaved: (conversion: Conversion) => void
}

const KINDS: readonly UnitGroup[] = ['volume', 'mass', 'piece']

const UNIT_ERRORS: Partial<Record<string, string>> = {
  unit_not_for_ingredient: 'ingredients.unitNotForIngredient',
  unit_is_own_unit: 'conversions.unitIsOwn',
  duplicate: 'conversions.duplicate',
  conversion_in_use: 'conversions.unitInUse',
}

export function ConversionSheet(props: ConversionSheetProps) {
  const t = useT()
  // A fresh form, with the given values, each time the sheet opens.
  const [opened, setOpened] = useState({ open: props.open, count: 0 })
  if (props.open !== opened.open) setOpened({ open: props.open, count: opened.count + (props.open ? 1 : 0) })

  // The unit box is drawn by the unit field; it is reached by its id.
  const unitId = `${useId()}-unit`
  const unitRef = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return document.getElementById(unitId)
      },
    }),
    [unitId],
  )
  const factorRef = useRef<HTMLInputElement>(null)
  // A new conversion without a unit starts in the unit; otherwise the number.
  const startsInUnit = !props.conversion && !props.unit

  return createPortal(
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title={props.conversion ? t('conversions.editTitle') : t('conversions.addTitle')}
      initialFocus={startsInUnit ? unitRef : factorRef}
    >
      <ConversionForm key={opened.count} {...props} unitId={unitId} factorRef={factorRef} />
    </Sheet>,
    document.body,
  )
}

interface Errors {
  unit?: string
  factor?: string
  save?: string
}

function ConversionForm({
  ingredient,
  conversion,
  unit: givenUnit,
  onSaved,
  onClose,
  unitId,
  factorRef,
}: ConversionSheetProps & { unitId: string; factorRef: RefObject<HTMLInputElement | null> }) {
  const t = useT()
  const [unit, setUnit] = useState(conversion?.unit ?? givenUnit ?? '')
  const [factor, setFactor] = useState(conversion?.factor ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  // A conversion that recipes use keeps its unit (the server refuses a new one).
  const unitLocked = (conversion?.recipe_count ?? 0) > 0

  const typedFactor = typedNumber(factor)
  const goodFactor = typedFactor !== null && Number(typedFactor) > 0 ? typedFactor : null

  async function save(event: FormEvent) {
    event.preventDefault()
    // The sheet is drawn outside the page, but React still passes the
    // submit up to a form around its opener (the ingredient form).
    event.stopPropagation()
    if (saving) return
    const trimmed = unit.trim()
    const found: Errors = {}
    if (!trimmed) found.unit = t('conversions.unitRequired')
    if (goodFactor === null) found.factor = t('conversions.factorInvalid')
    setErrors(found)
    if (found.unit || goodFactor === null) {
      focusFirst(found)
      return
    }

    setSaving(true)
    try {
      const path = { ingredient_id: ingredient.id }
      const body = { unit: trimmed, factor: goodFactor }
      const { data, error } = conversion
        ? await api.PUT('/api/ingredients/{ingredient_id}/conversions/{conversion_id}', {
            params: { path: { ...path, conversion_id: conversion.id } },
            body,
          })
        : await api.POST('/api/ingredients/{ingredient_id}/conversions', { params: { path }, body })
      if (data) {
        onSaved(data)
        return
      }
      const byField = fieldErrors(error)
      const refused: Errors = {}
      const unitKey = UNIT_ERRORS[byField.unit ?? '']
      if (unitKey) refused.unit = t(unitKey)
      else if (byField.unit) refused.unit = t('conversions.unitRequired')
      if (byField.factor) {
        refused.factor = /decimal|digits|whole/.test(byField.factor) ? t('conversions.numberTooLong') : t('conversions.factorInvalid')
      }
      if (!refused.unit && !refused.factor) refused.save = t('conversions.saveFailed')
      setErrors(refused)
      focusFirst(refused)
    } catch {
      setErrors({ save: t('conversions.saveFailed') })
    } finally {
      setSaving(false)
    }
  }

  function focusFirst(found: Errors) {
    if (found.unit && !unitLocked) document.getElementById(unitId)?.focus()
    else if (found.factor) factorRef.current?.focus()
  }

  const shownUnit = unit.trim() || '…'
  const shownFactor = goodFactor ?? '…'

  return (
    <form className="conv-sheet" noValidate onSubmit={save}>
      <p className="sheet-preview conv-preview">
        {t('conversions.preview', { unit: shownUnit, name: ingredient.name, factor: shownFactor, own: ingredient.unit })}
      </p>
      <UnitField
        id={unitId}
        label={t('conversions.unit')}
        value={unit}
        onChange={(text) => {
          setUnit(text)
          setErrors((e) => ({ ...e, unit: undefined, save: undefined }))
        }}
        kinds={KINDS}
        disabled={unitLocked}
        hint={unitLocked ? t('conversions.unitInUse') : undefined}
        error={errors.unit}
      />
      <Field label={t('conversions.factor', { own: ingredient.unit })} error={errors.factor} className="conv-factor">
        {(control) => (
          <span className="conv-factor-line">
            <input
              {...control}
              ref={factorRef}
              name="factor"
              inputMode="decimal"
              autoComplete="off"
              className="conv-number"
              value={factor}
              onChange={(event) => {
                setFactor(event.target.value)
                setErrors((e) => ({ ...e, factor: undefined, save: undefined }))
              }}
            />
            <span className="conv-own" translate="no">
              {ingredient.unit}
            </span>
          </span>
        )}
      </Field>
      {errors.save ? (
        <p className="conv-alert" role="alert">
          {errors.save}
        </p>
      ) : null}
      <div className="sheet-actions">
        <button type="button" className={buttonClass({ variant: 'ghost' })} onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button type="submit" className={buttonClass({ variant: 'primary' })} disabled={saving}>
          {t('common.save')}
        </button>
      </div>
    </form>
  )
}
