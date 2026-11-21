// From "react-router", not "react-router/dom": in tests the two can load as
// separate copies (one CommonJS, one ES module) that don't share a context.
import { RouterProvider, type createBrowserRouter } from 'react-router'
import { I18nProvider } from './i18n/i18n'

export type AppRouter = ReturnType<typeof createBrowserRouter>

/** The React app around a router: a browser router in the page, a memory
 * router in tests. App-wide providers (the translator, the edition) go here.
 * `onMissingMessage` hears of a key with no message (the harness fails the
 * test on it). */
export function App({ router, onMissingMessage }: { router: AppRouter; onMissingMessage?: (key: string) => void }) {
  return (
    <I18nProvider onMissing={onMissingMessage}>
      <RouterProvider router={router} />
    </I18nProvider>
  )
}
