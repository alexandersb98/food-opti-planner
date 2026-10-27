import { createRouter, createWebHistory, type RouterHistory } from 'vue-router'
import { api, setUnauthorizedHandler } from './api/client'
import MainLayout from './layouts/MainLayout.vue'
import IngredientPage from './pages/IngredientPage.vue'
import LoginPage from './pages/LoginPage.vue'
import RecipeFiltersPage from './pages/RecipeFiltersPage.vue'
import RecipePage from './pages/RecipePage.vue'
import ResultsPage from './pages/ResultsPage.vue'
import SchedulePage from './pages/SchedulePage.vue'
import { pages } from './pages'

/** The login page, coming back to `redirect` afterwards. */
export function loginRoute(redirect: string) {
  return { name: 'login', query: redirect === '/' ? {} : { redirect } }
}

export function makeRouter(history: RouterHistory = createWebHistory()) {
  const router = createRouter({
    history,
    routes: [
      { path: '/login', name: 'login', component: LoginPage },
      {
        path: '/',
        component: MainLayout,
        children: [
          ...pages.map(({ path, name, component }) => ({ path, name, component })),
          // Editors, opened from their page's list or card.
          { path: '/plan/schedule', name: 'schedule', component: SchedulePage },
          { path: '/plan/recipes', name: 'recipe-filters', component: RecipeFiltersPage },
          // A made plan (R1): the unsaved one, or a saved one, opened at
          // `?day=` (from 0) with `?meal=` open, from the Today card.
          { path: '/plans/new', name: 'new-plan', component: ResultsPage },
          { path: '/plans/:id(\\d+)', name: 'saved-plan', component: ResultsPage },
          { path: '/recipes/new', name: 'new-recipe', component: RecipePage },
          { path: '/recipes/:id(\\d+)', name: 'recipe', component: RecipePage },
          { path: '/ingredients/new', name: 'new-ingredient', component: IngredientPage },
          { path: '/ingredients/:id(\\d+)', name: 'ingredient', component: IngredientPage },
        ],
      },
    ],
  })

  // Every page needs a session; the server says whether there is one.
  router.beforeEach(async (to) => {
    if (to.name === 'login') return true
    try {
      const { response } = await api.GET('/api/session')
      return response.status === 401 ? loginRoute(to.fullPath) : true
    } catch {
      return true // server unreachable: show the page; its own calls will fail visibly
    }
  })

  setUnauthorizedHandler(() => {
    const current = router.currentRoute.value
    if (current.name !== 'login') void router.push(loginRoute(current.fullPath))
  })

  return router
}
