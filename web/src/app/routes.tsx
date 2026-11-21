import { redirect, type RouteObject } from 'react-router'
import { Brief } from './pages/brief/Brief'
import { Ingredients } from './pages/ingredients/Ingredients'
import { Login } from './pages/login/Login'
import { RecipeIndex } from './pages/recipes/RecipeIndex'
import { NotFound } from './shell/NotFound'
import { sessionLoader } from './shell/session'
import { Shell } from './shell/Shell'

/** The route table, the one place routes are registered: one line per
 * route, each pointing at its page's file. A page ticket replaces only its
 * own line(s); don't reorder them. The pages' order, folios and running
 * heads come from the page registry (shell/registry.ts). The brief (the
 * home page), the two indexes and the login page are in the main bundle;
 * every other page is a lazy route with its own bundle. */
export const routes: RouteObject[] = [
  // The type specimen: dev server and tests only, never in a production build.
  ...(import.meta.env.DEV ? [{ path: '/specimen', lazy: async () => ({ Component: (await import('./specimen/Specimen')).Specimen }) }] : []),
  { path: '/login', Component: Login },
  {
    // Every other page sits in the shell, which asks for the session first.
    path: '/',
    Component: Shell,
    loader: sessionLoader,
    // checked when the shell opens; a later 401 is caught by the client's handler
    shouldRevalidate: () => false,
    HydrateFallback: () => null,
    children: [
      { index: true, Component: Brief },
      { path: 'plans/new', lazy: async () => ({ Component: (await import('./pages/menu/Menu')).Menu }) },
      { path: 'plans', lazy: async () => ({ Component: (await import('./pages/archive/Archive')).Archive }) },
      { path: 'plans/:id', lazy: async () => ({ Component: (await import('./pages/menu/Menu')).Menu }) },
      { path: 'recipes', Component: RecipeIndex },
      { path: 'recipes/new', lazy: async () => ({ Component: (await import('./pages/recipe/RecipeSpread')).RecipeSpread }) },
      { path: 'recipes/import', lazy: async () => ({ Component: (await import('./pages/import/Import')).Import }) },
      { path: 'recipes/:id', lazy: async () => ({ Component: (await import('./pages/recipe/RecipeSpread')).RecipeSpread }) },
      { path: 'ingredients', Component: Ingredients },
      { path: 'ingredients/new', lazy: async () => ({ Component: (await import('./pages/ingredient/Ingredient')).Ingredient }) },
      { path: 'ingredients/:id', lazy: async () => ({ Component: (await import('./pages/ingredient/Ingredient')).Ingredient }) },
      { path: 'attributes', lazy: async () => ({ Component: (await import('./pages/attributes/Attributes')).Attributes }) },
      { path: 'tags', lazy: async () => ({ Component: (await import('./pages/tags/Tags')).Tags }) },
      { path: 'settings', lazy: async () => ({ Component: (await import('./pages/settings/Settings')).Settings }) },
      { path: 'settings/data-sources/:key', lazy: async () => ({ Component: (await import('./pages/data-source/DataSource')).DataSource }) },
      // Old links to the brief's editors open them as sheets on the brief.
      { path: 'plan/schedule', loader: () => redirect('/?sheet=schedule') },
      { path: 'plan/recipes', loader: () => redirect('/?sheet=filters') },
      { path: '*', Component: NotFound },
    ],
  },
]
