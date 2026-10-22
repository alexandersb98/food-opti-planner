import { createRouter, createWebHistory, type RouterHistory } from 'vue-router'
import { api, setUnauthorizedHandler } from './api/client'
import MainLayout from './layouts/MainLayout.vue'
import LoginPage from './pages/LoginPage.vue'
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
        children: pages.map(({ path, name, component }) => ({ path, name, component })),
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
