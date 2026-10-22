import { createRouter, createWebHistory, type RouterHistory } from 'vue-router'
import PlaceholderPage from './pages/PlaceholderPage.vue'

// The five pages of the menu (C0), in menu order. Each slice swaps its
// page's placeholder for the real screen.
export const pages = [
  { path: '/', name: 'plan', icon: 'event_note', component: PlaceholderPage },
  { path: '/recipes', name: 'recipes', icon: 'menu_book', component: PlaceholderPage },
  { path: '/ingredients', name: 'ingredients', icon: 'egg', component: PlaceholderPage },
  { path: '/attributes', name: 'attributes', icon: 'tune', component: PlaceholderPage },
  { path: '/tags', name: 'tags', icon: 'sell', component: PlaceholderPage },
] as const

export function makeRouter(history: RouterHistory = createWebHistory()) {
  return createRouter({
    history,
    routes: pages.map(({ path, name, component }) => ({ path, name, component })),
  })
}
