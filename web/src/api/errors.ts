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
