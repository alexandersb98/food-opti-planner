/** Rows by id, to look up what another row refers to. */
export function byId<T extends { id: number }>(rows: readonly T[]) {
  return new Map(rows.map((row) => [row.id, row]))
}

/** The rows whose name contains `search` (ignoring case), sorted by name.
 * A cleared search box gives `null`, which matches everything. */
export function searchByName<T extends { name: string }>(rows: readonly T[], search: string | null) {
  const text = (search ?? '').trim().toLocaleLowerCase()
  return rows
    .filter((row) => row.name.toLocaleLowerCase().includes(text))
    .sort((a, b) => a.name.localeCompare(b.name))
}
