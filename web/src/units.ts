import { reactive, readonly, toRefs } from 'vue'
import { api } from './api/client'
import type { CatalogueUnit } from './api/types'

// The unit catalogue the server sent (GET /api/units), kept outside any page
// so every unit field sees it without a refetch. The server holds the rules
// (prefixes, factors); `findUnit` only looks a typed text up among the
// spellings it sent, normalising the text as the server does.

export type Category = 'mass' | 'volume' | 'energy'

const state = reactive({
  units: [] as CatalogueUnit[],
  loading: false,
  failed: false,
})
let loaded = false
let pending: Promise<void> | null = null
// Counts resets, so a load that was in flight at one can't fill the state.
let generation = 0

/** As the server reads a unit: NFKC, trimmed, inner runs of spaces
 * collapsed, one trailing period dropped. */
function clean(text: string): string {
  let cleaned = text.normalize('NFKC').replace(/\s+/g, ' ').trim()
  if (cleaned.endsWith('.')) cleaned = cleaned.slice(0, -1).trim()
  return cleaned
}

export function useUnits() {
  async function fetchUnits() {
    const mine = generation
    state.loading = true
    state.failed = false
    try {
      const { data } = await api.GET('/api/units')
      if (mine !== generation) return
      if (data) {
        state.units = data.units
        loaded = true
      } else state.failed = true
    } catch {
      if (mine === generation) state.failed = true
    }
    if (mine === generation) state.loading = false
  }

  /** Fetch the catalogue once; later calls return at once. A failed load
   * can be tried again. */
  function load(): Promise<void> {
    if (loaded) return Promise.resolve()
    pending ??= fetchUnits().finally(() => (pending = null))
    return pending
  }

  /** The units a category's drop-down offers, in the server's order; with
   * null, the offered free-text units (st). */
  function offered(category: Category | null): CatalogueUnit[] {
    return state.units.filter((unit) => unit.offered && unit.category === category)
  }

  /** The catalogue unit a text names in any spelling, if any. */
  function findUnit(text: string): CatalogueUnit | undefined {
    const cleaned = clean(text)
    if (!cleaned) return undefined
    const exact = state.units.find((unit) => unit.case_sensitive_aliases.some((alias) => clean(alias) === cleaned))
    if (exact) return exact
    const key = cleaned.toLowerCase()
    return state.units.find((unit) => [unit.symbol, ...unit.aliases].some((spelling) => clean(spelling).toLowerCase() === key))
  }

  /** `findUnit`, except that a capital M before a milli unit ("MJ", "Ml") is
   * mega, not milli: free text, as the server reads it. A milli unit is one
   * whose symbol is "m" and the symbol of another unit (mg, ml, mJ). */
  function unitNamed(text: string): CatalogueUnit | undefined {
    const unit = findUnit(text)
    if (!unit || !unit.symbol.startsWith('m') || clean(text)[0] !== 'M') return unit
    const base = unit.symbol.slice(1)
    return state.units.some((other) => other.symbol === base) ? undefined : unit
  }

  /** Whether an amount in `a` converts to `b`: the server's rule
   * (`units.factor`). Both name catalogue units of the same category, or are
   * the same unit; or neither names a unit and the cleaned texts are equal
   * (ignoring case) and not empty. The server stays the authority. */
  function convertible(a: string, b: string): boolean {
    const unitA = unitNamed(a)
    const unitB = unitNamed(b)
    if (!unitA && !unitB) {
      const key = clean(a).toLowerCase()
      return key !== '' && key === clean(b).toLowerCase()
    }
    if (!unitA || !unitB) return false
    return unitA === unitB || (unitA.category !== null && unitA.category === unitB.category)
  }

  /** How a drop-down shows a unit: "kg (kilogram)". */
  function label(unit: CatalogueUnit): string {
    return `${unit.symbol} (${unit.name})`
  }

  /** The value basis a unit starts with: '100' for a mass or volume unit in
   * any spelling, '1' for anything else (also while the catalogue is empty). */
  function basisFor(text: string): '100' | '1' {
    const category = findUnit(text)?.category
    return category === 'mass' || category === 'volume' ? '100' : '1'
  }

  return { ...toRefs(readonly(state)), load, offered, findUnit, unitNamed, convertible, label, basisFor }
}

/** Forget the catalogue, for tests. */
export function resetUnits() {
  generation++
  loaded = false
  pending = null
  Object.assign(state, { units: [], loading: false, failed: false })
}
