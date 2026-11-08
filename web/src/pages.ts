import AttributesPage from './pages/AttributesPage.vue'
import IngredientsPage from './pages/IngredientsPage.vue'
import PlanPage from './pages/PlanPage.vue'
import RecipesPage from './pages/RecipesPage.vue'
import SettingsPage from './pages/SettingsPage.vue'
import TagsPage from './pages/TagsPage.vue'

// The six pages of the menu (C0), in menu order.
export const pages = [
  { path: '/', name: 'plan', icon: 'event_note', component: PlanPage },
  { path: '/recipes', name: 'recipes', icon: 'menu_book', component: RecipesPage },
  { path: '/ingredients', name: 'ingredients', icon: 'egg', component: IngredientsPage },
  { path: '/attributes', name: 'attributes', icon: 'tune', component: AttributesPage },
  { path: '/tags', name: 'tags', icon: 'sell', component: TagsPage },
  { path: '/settings', name: 'settings', icon: 'settings', component: SettingsPage },
] as const
