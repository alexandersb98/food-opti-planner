import { useMemo } from 'react'
import type { Ingredient } from '../../../api/types'
import { isOwn, pickerOptions } from '../../../lineUnits'
import type { DraftLine } from '../../../recipeDraft'
import type { useUnits } from '../../hooks/useUnits'
import { useT } from '../../i18n/i18n'
import { Select, type SelectGroup, type SelectOption } from '../../ui/select/Select'

/** The unit catalogue as useUnits gives it. */
export type Units = ReturnType<typeof useUnits>

/** Picks "New unit…" in a line's unit list; no unit is spelled so. */
const NEW_UNIT = '\u0000new'

/** A line's unit: a native list in groups (the ingredient's own unit, the
 * other units that convert, its conversions with their numbers, ✨ for the
 * AI's) and "New unit…". The box shows just the unit. */
export function LineUnit({
  id,
  line,
  ingredient,
  name,
  stale,
  units,
  invalid,
  disabled,
  describedBy,
  onUnit,
  onNewUnit,
}: {
  id: string
  line: DraftLine
  ingredient: Ingredient
  name: string
  stale: boolean
  units: Units
  invalid: boolean
  disabled?: boolean
  describedBy?: string
  onUnit: (unit: string) => void
  onNewUnit: () => void
}) {
  const t = useT()
  const { ratio, offered, label, findUnit } = units
  const options = useMemo(() => {
    const found = pickerOptions(ratio, [...offered('mass'), ...offered('volume'), ...offered(null)], ingredient)
    const own: SelectOption[] = [{ value: '', label: found.own }]
    const groups: (SelectOption | SelectGroup)[] = [{ group: t('recipes.unitGroups.own'), options: own }]
    if (found.steps.length > 0) {
      groups.push({
        group: t('recipes.unitGroups.steps'),
        options: found.steps.map((unit) => ({ value: unit.symbol, label: label(unit) })),
      })
    }
    if (found.conversions.length > 0) {
      groups.push({
        group: t('recipes.unitGroups.conversions'),
        options: found.conversions.map((conversion) => ({
          value: conversion.unit,
          label: t(conversion.source === 'ai' ? 'recipe.unitConversionAi' : 'recipe.unitConversion', {
            unit: conversion.unit,
            factor: conversion.factor,
            own: ingredient.unit,
          }),
        })),
      })
    }
    return groups
  }, [ratio, offered, label, ingredient, t])

  // The value as the list spells it: the own unit is '', another unit its
  // conversion or catalogue symbol; a unit it doesn't offer is added, marked.
  const typed = line.unit.trim()
  const listed = (wanted: string) =>
    options.some((entry) => ('group' in entry ? entry.options.some((o) => o.value === wanted) : entry.value === wanted))
  const symbol = findUnit(typed)?.symbol ?? typed
  const value = isOwn(ratio, ingredient, typed) ? '' : listed(typed) ? typed : listed(symbol) ? symbol : typed
  const all: (SelectOption | SelectGroup)[] = listed(value)
    ? options
    : [{ value, label: stale ? t('recipe.unitStale', { unit: typed }) : typed }, ...options]
  const shown = value === '' ? ingredient.unit : symbol

  return (
    <span className={stale || invalid ? 'lines-unit lines-unit-stale' : 'lines-unit'}>
      <span className="lines-unit-shown" aria-hidden="true" translate="no">
        {shown}
      </span>
      <Select
        id={id}
        annotation
        className="lines-unit-select"
        aria-label={t('recipes.unitOf', { name })}
        aria-invalid={invalid || stale ? true : undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        value={value}
        options={[...all, { value: NEW_UNIT, label: t('recipes.newUnit') }]}
        onValueChange={(next) => (next === NEW_UNIT ? onNewUnit() : onUnit(next))}
      />
    </span>
  )
}
