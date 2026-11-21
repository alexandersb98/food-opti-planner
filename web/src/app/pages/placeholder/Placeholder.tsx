import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { api } from '../../../api/client'
import { useT } from '../../i18n/i18n'

type Server = 'checking' | 'up' | 'down'

const serverText: Record<Server, string> = {
  checking: 'Checking the server…',
  up: 'The server answers.',
  down: 'The server does not answer.',
}

/** Stands in for every page until ticket 08 registers the real routes. It
 * shows the path it was reached at (deep paths work) and asks the server
 * for its health through the shared typed client. */
export function Placeholder() {
  const { pathname } = useLocation()
  const [server, setServer] = useState<Server>('checking')
  const t = useT()

  useEffect(() => {
    let current = true
    api.GET('/api/health').then(
      ({ response }) => current && setServer(response.ok ? 'up' : 'down'),
      () => current && setServer('down'),
    )
    return () => {
      current = false
    }
  }, [])

  return (
    <main>
      <h1>{t('app.title')}</h1>
      <p>The new app is being built here. Until it is ready, use <a href="/">the current app</a>.</p>
      <p>
        Page: <code>{pathname}</code>
      </p>
      <p role="status">{serverText[server]}</p>
    </main>
  )
}
