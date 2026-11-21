import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { App } from './App'
import { BASE_PATH } from './base'
import { routes } from './routes'

const router = createBrowserRouter(routes, { basename: BASE_PATH })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App router={router} />
  </StrictMode>,
)
