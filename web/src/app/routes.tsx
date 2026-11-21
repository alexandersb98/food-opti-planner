import type { RouteObject } from 'react-router'
import { Placeholder } from './pages/placeholder/Placeholder'

/** The route tree, the one place routes are registered. Ticket 08 replaces
 * the placeholder with the full table, one line per route. */
export const routes: RouteObject[] = [
  // The type specimen: dev server and tests only, never in a production build.
  ...(import.meta.env.DEV ? [{ path: '/specimen', lazy: async () => ({ Component: (await import('./specimen/Specimen')).Specimen }) }] : []),
  { path: '*', Component: Placeholder },
]
