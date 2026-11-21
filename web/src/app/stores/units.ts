import { api } from '../../api/client'
import type { CatalogueUnit } from '../../api/types'
import { fraction, ONE, over, type Fraction } from '../../fractions'
import { createState } from './state'

// The unit catalogue the server sent (GET /api/units), loaded once and shared
// by every unit field. The server holds the rules (prefixes, factors); the
// lookups below only find a typed text among the spellings it sent,
// normalising the text as the server does. A port of the Vue `units` module.

export type Category = 'mass' | 'volume' | 'energy'

export interface UnitsState {
  units: readonly CatalogueUnit[]
  loading: boolean
  failed: boolean
}

const EMPTY: UnitsState = { units: [], loading: false, failed: false }

const state = createState<UnitsState>(EMPTY)
let loaded = false
let pending: Promise<void> | null = null
// Counts resets, so a load that was in flight at one can't fill the state.
let generation = 0

async function fetchUnits() {
  const mine = generation
  state.update({ loading: true, failed: false })
  try {
    const { data } = await api.GET('/api/units')
    if (mine !== generation) return
    if (data) {
      loaded = true
      state.update({ units: data.units, loading: false })
    } else state.update({ failed: true, loading: false })
  } catch {
    if (mine === generation) state.update({ failed: true, loading: false })
  }
}

/** Fetch the catalogue once; later calls return at once, calls during a
 * load share it. A failed load is tried again by the next call. Never
 * rejects. */
function load(): Promise<void> {
  if (loaded) return Promise.resolve()
  pending ??= fetchUnits().finally(() => (pending = null))
  return pending
}

/** Forget the catalogue, for tests: a load in flight no longer counts. */
function reset() {
  generation++
  loaded = false
  pending = null
  state.set(EMPTY)
}

export const unitsStore = {
  subscribe: state.subscribe,
  getSnapshot: state.getSnapshot,
  load,
  reset,
}

/** As the server reads a unit: NFKC, trimmed, inner runs of spaces
 * collapsed, one trailing period dropped. */
function clean(text: string): string {
  let cleaned = text.normalize('NFKC').replace(/\s+/g, ' ').trim()
  if (cleaned.endsWith('.')) cleaned = cleaned.slice(0, -1).trim()
  return cleaned
}

/** The lookups over a catalogue (the units the server sent). */
export interface Catalogue {
  units: readonly CatalogueUnit[]
  /** The units a category's drop-down offers, in the server's order; with
   * null, the offered free-text units (st). */
  offered: (category: Category | null) => CatalogueUnit[]
  /** The catalogue unit a text names in any spelling, if any. */
  findUnit: (text: string) => CatalogueUnit | undefined
  /** Whether an amount in `a` converts to `b` (the server's `units.factor`). */
  convertible: (a: string, b: string) => boolean
  /** What one `a` makes of `b`, exactly (the server's `units.ratio`), or null. */
  ratio: (a: string, b: string) => Fraction | null
  /** How a drop-down shows a unit: "kg (kilogram)". */
  label: (unit: CatalogueUnit) => string
  /** The value basis a unit starts with: '100' for mass or volume, else '1'. */
  basisFor: (text: string) => '100' | '1'
}

/** The lookups over `units`, the catalogue's units (the store's snapshot
 * `units`, or any list in that shape). */
export function catalogue(units: readonly CatalogueUnit[]): Catalogue {
  function offered(category: Category | null): CatalogueUnit[] {
    return units.filter((unit) => unit.offered && unit.category === category)
  }

  // As the server reads it, a capital M before a milli unit ("MJ", "Ml") is
  // mega, not milli: free text, so no unit. A milli unit is one whose symbol
  // is "m" and the symbol of another unit (mg, ml, mJ).
  function findUnit(text: string): CatalogueUnit | undefined {
    const cleaned = clean(text)
    if (!cleaned) return undefined
    const exact = units.find((unit) => unit.case_sensitive_aliases.some((alias) => clean(alias) === cleaned))
    const key = cleaned.toLowerCase()
    const unit =
      exact ?? units.find((unit) => [unit.symbol, ...unit.aliases].some((spelling) => clean(spelling).toLowerCase() === key))
    if (!unit || !unit.symbol.startsWith('m') || cleaned[0] !== 'M') return unit
    const base = unit.symbol.slice(1)
    return units.some((other) => other.symbol === base) ? undefined : unit
  }

  /** Same free text: neither names a unit and the cleaned texts are equal
   * (ignoring case) and not empty. */
  function sameFreeText(a: string, b: string): boolean {
    const key = clean(a).toLowerCase()
    return key !== '' && key === clean(b).toLowerCase()
  }

  // Both name catalogue units of the same category, or are the same unit; or
  // neither names a unit and the texts are the same free text. The server
  // stays the authority.
  function convertible(a: string, b: string): boolean {
    const unitA = findUnit(a)
    const unitB = findUnit(b)
    if (!unitA && !unitB) return sameFreeText(a, b)
    if (!unitA || !unitB) return false
    return unitA === unitB || (unitA.category !== null && unitA.category === unitB.category)
  }

  // 1 for the same unit in any spelling, or for equal free texts; the quotient
  // of the catalogue factors for two units of one category; null otherwise.
  function ratio(a: string, b: string): Fraction | null {
    const unitA = findUnit(a)
    const unitB = findUnit(b)
    if (!unitA && !unitB) return sameFreeText(a, b) ? ONE : null
    if (!unitA || !unitB) return null
    if (unitA === unitB) return ONE
    if (unitA.category === null || unitA.category !== unitB.category || !unitA.factor || !unitB.factor) return null
    return over(fraction(unitA.factor), fraction(unitB.factor))
  }

  // Also while the catalogue is empty, everything starts at '1'.
  function basisFor(text: string): '100' | '1' {
    const category = findUnit(text)?.category
    return category === 'mass' || category === 'volume' ? '100' : '1'
  }

  return { units, offered, findUnit, convertible, ratio, label: (unit) => `${unit.symbol} (${unit.name})`, basisFor }
}
