import AttributesPage from './pages/AttributesPage.vue'
import PlaceholderPage from './pages/PlaceholderPage.vue'

// The five pages of the menu (C0), in menu order. Each slice swaps its
// page's placeholder for the real screen.
export const pages = [
  { path: '/', name: 'plan', icon: 'event_note', component: PlaceholderPage },
  { path: '/recipes', name: 'recipes', icon: 'menu_book', component: PlaceholderPage },
  { path: '/ingredients', name: 'ingredients', icon: 'egg', component: PlaceholderPage },
  { path: '/attributes', name: 'attributes', icon: 'tune', component: AttributesPage },
  { path: '/tags', name: 'tags', icon: 'sell', component: PlaceholderPage },
] as const
