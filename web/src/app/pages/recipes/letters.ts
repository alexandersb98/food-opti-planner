/** The letter a name is filed under in the index: its first letter in
 * capitals without accents ("Éclair" under E), or "#" for a name that does
 * not start with a letter. */
export function initial(name: string): string {
  const first = name.trim().charAt(0).normalize('NFD').charAt(0).toLocaleUpperCase()
  return /\p{L}/u.test(first) ? first : '#'
}

/** Rows already sorted by name, in runs under their letters, in order:
 * `[{ letter: 'O', rows: [omelette] }, { letter: 'P', rows: [...] }]`. */
export function byLetter<T extends { name: string }>(rows: readonly T[]): Array<{ letter: string; rows: T[] }> {
  const groups: Array<{ letter: string; rows: T[] }> = []
  for (const row of rows) {
    const letter = initial(row.name)
    const last = groups.at(-1)
    if (last?.letter === letter) last.rows.push(row)
    else groups.push({ letter, rows: [row] })
  }
  return groups
}
