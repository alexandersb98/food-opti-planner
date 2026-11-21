import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { App } from './App'
import { routes } from './routes'
import './styles/global.css'

const router = createBrowserRouter(routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App router={router} />
  </StrictMode>,
)

// The Menu (a swipe from the brief) and the recipe spread are lazy routes
// visited most; fetch their bundles once the first page is up, so turning to
// them does not wait on the network.
const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 1500))
idle(() => {
  void import('./pages/menu/Menu')
  void import('./pages/recipe/RecipeSpread')
})
