/** Rows by id, to look up what another row refers to. */
export function byId<T extends { id: number }>(rows: readonly T[]) {
  return new Map(rows.map((row) => [row.id, row]))
}

// The default locale's collation, as `localeCompare` without arguments,
// made once rather than per comparison.
const collator = new Intl.Collator()

/** The rows sorted by name, as a new list. A search box filters this list
 * with `filterByName` on each keystroke; sort once, when the rows change. */
export function sortByName<T extends { name: string }>(rows: readonly T[]) {
  return [...rows].sort((a, b) => collator.compare(a.name, b.name))
}

/** The rows whose name contains `search` (ignoring case), in their given
 * order. A blank search, or a cleared box's `null`, gives the rows as
 * they are. */
export function filterByName<T extends { name: string }>(rows: readonly T[], search: string | null): readonly T[] {
  const text = (search ?? '').trim().toLocaleLowerCase()
  if (!text) return rows
  return rows.filter((row) => row.name.toLocaleLowerCase().includes(text))
}
