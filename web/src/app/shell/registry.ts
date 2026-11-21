import { matchPath } from 'react-router'

// The page registry: the Contents pages in order. The Contents list, the
// folios (page numbers), the running head, swipe order and turn links all
// come from it. Complete from the start; page tickets don't edit it (a page
// that needs another running head uses `useRunningHead`).

export type PageId = 'brief' | 'menu' | 'recipes' | 'archive' | 'ingredients' | 'attributes' | 'tags' | 'settings'

export interface RegistryPage {
  id: PageId
  /** Where the page lives. */
  path: string
  /** Message keys: the name in Contents, its one-line description, and the
   * running head's text. */
  title: string
  description: string
  run: string
  /** The page's number, from 1, in Contents order. */
  folio: number
}

const order: ReadonlyArray<[PageId, string]> = [
  ['brief', '/'],
  ['menu', '/plans/new'],
  ['recipes', '/recipes'],
  ['archive', '/plans'],
  ['ingredients', '/ingredients'],
  ['attributes', '/attributes'],
  ['tags', '/tags'],
  ['settings', '/settings'],
]

/** The Contents pages, in Contents order (D2's order with the catalogue
 * pages after Ingredients). */
export const registry: readonly RegistryPage[] = order.map(([id, path], index) => ({
  id,
  path,
  title: `shell.pages.${id}.title`,
  description: `shell.pages.${id}.description`,
  run: `shell.pages.${id}.run`,
  folio: index + 1,
}))

/** Routes that are not Contents pages, and the page each belongs to: its
 * folio and running head, and where a swipe turns from. */
export const detailRoutes: ReadonlyArray<{ path: string; page: PageId }> = [
  { path: '/plans/:id', page: 'archive' },
  { path: '/recipes/new', page: 'recipes' },
  { path: '/recipes/import', page: 'recipes' },
  { path: '/recipes/:id', page: 'recipes' },
  { path: '/ingredients/new', page: 'ingredients' },
  { path: '/ingredients/:id', page: 'ingredients' },
  { path: '/settings/data-sources/:key', page: 'settings' },
  { path: '/plan/schedule', page: 'brief' },
  { path: '/plan/recipes', page: 'brief' },
]

const byId = new Map(registry.map((page) => [page.id, page]))

/** The registry page with this id. */
export function registryPage(id: PageId): RegistryPage {
  return byId.get(id)!
}

/** The registry page a path belongs to: a Contents
 * page itself, or the page a detail route names; none for a path the app
 * doesn't have. */
export function pageFor(pathname: string): RegistryPage | undefined {
  const page = registry.find(({ path }) => matchPath(path, pathname))
  if (page) return page
  const detail = detailRoutes.find(({ path }) => matchPath(path, pathname))
  return detail && byId.get(detail.page)
}
