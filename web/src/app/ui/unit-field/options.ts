import type { CatalogueUnit, Preferences } from '../../../api/types'
import { preferredUnit } from '../../stores/preferences'
import type { Catalogue, Category } from '../../stores/units'

type Offered = Catalogue['offered']

/** A group of the unit list: a kind of unit, or 'piece' for "Other", the
 * catalogue's known free-text units (st). */
export type UnitGroup = Category | 'piece'

export interface OptionGroup {
  group: UnitGroup
  units: CatalogueUnit[]
  /** The place of the group's first unit in the whole list. */
  start: number
}

/** The units a group offers, in the server's order with the owner's
 * preferred unit of that kind first. */
function inGroup(offered: Offered, preferences: Preferences | null, group: UnitGroup): CatalogueUnit[] {
  if (group === 'piece') return offered(null)
  const preferred = preferredUnit(preferences, group)
  const units = offered(group)
  return [...units.filter((u) => u.symbol === preferred), ...units.filter((u) => u.symbol !== preferred)]
}

/** Whether any spelling of the unit (symbol, name, alias) contains the text,
 * ignoring case. */
function matches(unit: CatalogueUnit, text: string): boolean {
  const key = text.trim().toLowerCase()
  return [unit.symbol, unit.name, ...unit.aliases].some((spelling) => spelling.toLowerCase().includes(key))
}

/** The list a unit field shows: the given groups in their order, each with
 * its units (preferred first) that match `needle`; null shows them all.
 * Groups left empty are dropped. */
export function unitOptions(
  offered: Offered,
  preferences: Preferences | null,
  groups: readonly UnitGroup[],
  needle: string | null,
): OptionGroup[] {
  let start = 0
  return groups.flatMap((group) => {
    const units = inGroup(offered, preferences, group).filter((unit) => needle === null || matches(unit, needle))
    if (units.length === 0) return []
    const found = { group, units, start }
    start += units.length
    return [found]
  })
}
