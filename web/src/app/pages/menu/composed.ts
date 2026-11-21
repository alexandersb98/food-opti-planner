/** Router state that opens The Menu on a just-composed plan, with the
 * reveal (the days set one after another, the stamp landing; once per plan,
 * never with reduced motion): `navigate('/plans/new', { state: composedState })`. */
export const composedState = { composed: true } as const

/** Whether the router state says the plan was just composed. */
export function isComposed(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as { composed?: unknown }).composed === true
}
