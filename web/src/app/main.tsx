import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { App } from './App'
import { routes } from './routes'
import { hideSplashWhenReady } from './splash'
import './styles/global.css'

const router = createBrowserRouter(routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App router={router} />
  </StrictMode>,
)
hideSplashWhenReady(router)

// The service worker keeps the app's files on the device, so a home-screen
// launch paints the splash at once while the server wakes (public/sw.js).
// Production only: in dev it would serve stale modules. Registered after
// load, so it never competes with the first page for the network.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {}) // the app works without it
  })
}

// The page may come from the service worker's cache while the server has a
// newer build, whose lazy bundles have new names: a bundle of the old build
// then fails to load. Reload once to pick up the new build (the worker has
// fetched it behind the cached page by then).
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (sessionStorage.getItem('planner.reloadedForBuild')) return
    sessionStorage.setItem('planner.reloadedForBuild', '1')
  } catch {
    return // storage blocked: no reload, so no loop
  }
  event.preventDefault()
  window.location.reload()
})

// The Menu (a swipe from the brief) and the recipe spread are lazy routes
// visited most; fetch their bundles once the first page is up, so turning to
// them does not wait on the network.
const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 1500))
idle(() => {
  void import('./pages/menu/Menu')
  void import('./pages/recipe/RecipeSpread')
})
