/** The server's errors about fields of a request body, by field: its 409s
 * and FastAPI's 422s share the shape `{ detail: [{ loc, type, msg }] }`.
 * Gives each field's first error type, e.g. `{ name: 'name_in_use' }`;
 * a nested field is a dotted path, e.g. `values.0.value`. */
export function fieldErrors(error: unknown): Partial<Record<string, string>> {
  const detail = (error as { detail?: unknown } | undefined)?.detail
  const errors: Partial<Record<string, string>> = {}
  if (!Array.isArray(detail)) return errors
  for (const { loc, type } of detail as { loc?: unknown; type?: unknown }[]) {
    if (!Array.isArray(loc) || loc[0] !== 'body' || loc.length < 2 || typeof type !== 'string') continue
    errors[loc.slice(1).join('.')] ??= type
  }
  return errors
}

/** The first error `type` in a FieldErrors answer, whatever its `loc`: for
 * the errors that belong to no one field (`loc: ["body"]`, such as
 * `limit_reached`), and null when the error is not of that shape. */
export function errorType(error: unknown): string | null {
  const detail = (error as { detail?: unknown } | undefined)?.detail
  if (!Array.isArray(detail)) return null
  for (const { type } of detail as { type?: unknown }[]) {
    if (typeof type === 'string') return type
  }
  return null
}

/** The server's sentence for a refused unit change in a 422 of a save (the
 * preview shows it from its facts; this is for a save that raced a change
 * elsewhere), or null if the error is not one: a `conversion_` refusal,
 * `unit_mismatch` (a source column mapped to the attribute would stop
 * converting) or `unit_has_dependents` (the ingredient got a conversion or a
 * recipe line in another unit meanwhile). */
export function conversionRefusal(error: unknown): string | null {
  const detail = (error as { detail?: unknown } | undefined)?.detail
  if (!Array.isArray(detail)) return null
  for (const { loc, type, msg } of detail as { loc?: unknown; type?: unknown; msg?: unknown }[]) {
    const onUnit = Array.isArray(loc) && loc[0] === 'body' && loc[1] === 'unit'
    if (onUnit && typeof type === 'string' && (type.startsWith('conversion_') || type === 'unit_mismatch' || type === 'unit_has_dependents') && typeof msg === 'string') return msg
  }
  return null
}
