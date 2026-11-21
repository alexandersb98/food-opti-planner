import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { api, setUnauthorizedHandler } from '../../api/client'
import { useT } from '../i18n/i18n'
import { Contents, type ContentsClose, type Counts } from './Contents'
import { Masthead } from './Masthead'
import { PageFoot, SkipLink } from './PageTurn'
import { usePageTurns } from './turning'
import { pageFor } from './registry'
import { createRunningHeadOverride, RunningHeadContext } from './runningHead'
import { loginPath } from './session'
import { Toast } from './Toast'
import './shell.css'

/** The app shell every page but the login page sits in: the masthead, the
 * page itself, the Contents dialog and the toast region. Laid out as D2's
 * phone page, and from about 768px as a centred column on the desk. */
export function Shell() {
  const t = useT()
  const location = useLocation()
  const navigate = useNavigate()
  const page = pageFor(location.pathname)
  const [runningHead] = useState(createRunningHeadOverride)
  const [contentsOpen, setContentsOpen] = useState(false)
  const [counts, setCounts] = useState<Counts | null>(null)
  const countsAsked = useRef(0)
  const contentsButton = useRef<HTMLButtonElement>(null)
  const main = useRef<HTMLElement>(null)
  usePageTurns(main, page)

  // A 401 from any later call (login and the session check answer their
  // own) means the session ended: log in again, then come back here.
  const here = useRef('')
  useEffect(() => {
    here.current = location.pathname + location.search
  })
  useEffect(() => {
    setUnauthorizedHandler(() => void navigate(loginPath(here.current)))
    return () => setUnauthorizedHandler(() => {})
  }, [navigate])

  function openContents() {
    setContentsOpen(true)
    // fresh each time, so it shows what other pages changed; never waited for
    const asked = ++countsAsked.current
    api.GET('/api/counts').then(
      ({ data }) => {
        if (data && asked === countsAsked.current) setCounts(data)
      },
      () => {}, // no counts; the Contents work without them
    )
  }

  function closeContents(how: ContentsClose) {
    // closed at once, so the page is no longer inert and can take focus
    flushSync(() => setContentsOpen(false))
    if (how === 'dismiss') contentsButton.current?.focus()
    else main.current?.focus({ preventScroll: true })
  }

  async function loggedOut() {
    flushSync(() => setContentsOpen(false))
    await navigate('/login')
  }

  const title = page ? t(page.title) : null

  return (
    <RunningHeadContext value={runningHead}>
      <title>{title ? t('shell.documentTitle', { page: title }) : t('shell.wordmark')}</title>
      <div className="shell-desk">
        <div className="shell paper">
          {/* the page behind an open Contents can't be reached */}
          <div className="shell-frame" inert={contentsOpen}>
            <SkipLink main={main} />
            <Masthead
              page={page}
              contentsOpen={contentsOpen}
              onContents={openContents}
              contentsButton={contentsButton}
            />
            <main ref={main} id="page" className="shell-page" tabIndex={-1}>
              <Outlet />
              {page ? <PageFoot page={page} /> : null}
            </main>
          </div>
          {contentsOpen ? (
            <Contents current={page?.id} counts={counts} onClose={closeContents} onLoggedOut={loggedOut} />
          ) : null}
          <Toast />
        </div>
      </div>
    </RunningHeadContext>
  )
}
