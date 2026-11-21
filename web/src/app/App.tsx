// From "react-router", not "react-router/dom": in tests the two can load as
// separate copies (one CommonJS, one ES module) that don't share a context.
import { RouterProvider, type createBrowserRouter } from 'react-router'

export type AppRouter = ReturnType<typeof createBrowserRouter>

/** The React app around a router: a browser router in the page, a memory
 * router in tests. App-wide providers (the translator, the edition) go here. */
export function App({ router }: { router: AppRouter }) {
  return <RouterProvider router={router} />
}
