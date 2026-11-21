import type { RouteObject } from 'react-router'
import { Placeholder } from './pages/placeholder/Placeholder'

/** The route tree, the one place routes are registered. Ticket 08 replaces
 * the placeholder with the full table, one line per route. */
export const routes: RouteObject[] = [{ path: '*', Component: Placeholder }]
