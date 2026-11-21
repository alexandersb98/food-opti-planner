import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { api } from '../../api/client'
import type { components } from '../../api/schema'
import { useLocale, useT } from '../i18n/i18n'
import { registry, type PageId } from './registry'

export type Counts = components['schemas']['Counts']

/** The Contents pages that show how many of something there are. */
const counted: Partial<Record<PageId, keyof Counts>> = {
  recipes: 'recipes',
  ingredients: 'ingredients',
  attributes: 'attributes',
  tags: 'tags',
}

/** The ISO week number of a date (weeks start on Monday; week 1 holds the
 * year's first Thursday). */
export function isoWeek(date: Date): number {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7))
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1)
  return Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7)
}

/** How the Contents closed: dismissed (focus goes back to the Contents
 * button) or by following one of its links (focus goes to the new page). */
export type ContentsClose = 'dismiss' | 'navigate'

/** The table of contents: a full-screen modal dialog listing the pages in
 * order with their descriptions and folios, the current one marked, the
 * catalogue counts (fetched by the shell on every opening, never waited
 * for) and Log out at the end. Closes with its close button or Escape. */
export function Contents({
  current,
  counts,
  onClose,
  onLoggedOut,
}: {
  current: PageId | undefined
  counts: Counts | null
  onClose: (how: ContentsClose) => void
  onLoggedOut: () => void
}) {
  const t = useT()
  const { locale } = useLocale()
  const dialog = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [closing, setClosing] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutFailed, setLogoutFailed] = useState(false)

  // Opened: focus the close button, and hold the page still behind.
  useEffect(() => {
    close.current?.focus()
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
      clearTimeout(closeTimer.current)
    }
  }, [])

  /** Close with D2's fade, where the browser animates (not in tests). */
  function dismiss() {
    if (closing) return
    if (typeof dialog.current?.getAnimations !== 'function') return onClose('dismiss')
    setClosing(true)
    closeTimer.current = setTimeout(() => onClose('dismiss'), 320) // if the animation never ends
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    dismiss()
  }

  async function logOut() {
    setLoggingOut(true)
    setLogoutFailed(false)
    try {
      await api.POST('/api/logout')
    } catch {
      setLoggingOut(false)
      setLogoutFailed(true)
      return
    }
    onLoggedOut()
  }

  const today = new Date()
  const name = (part: 'weekday' | 'month') => new Intl.DateTimeFormat(locale.code, { [part]: 'long' }).format(today)

  return (
    <div
      ref={dialog}
      id="contents"
      className="contents"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contents-title"
      data-closing={closing || undefined}
      onKeyDown={onKeyDown}
      onAnimationEnd={(event) => {
        if (closing && event.target === event.currentTarget) onClose('dismiss')
      }}
    >
      <div className="contents-inner">
        <div className="contents-top">
          <p className="kicker">{t('shell.issue', { week: isoWeek(today), weekday: name('weekday'), day: today.getDate(), month: name('month') })}</p>
          <button ref={close} className="contents-close" type="button" aria-label={t('shell.closeContents')} onClick={dismiss}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </button>
        </div>
        <h2 id="contents-title" className="contents-title">
          {t('shell.contents')}
        </h2>
        <nav aria-labelledby="contents-title">
          <ol className="contents-list">
            {registry.map((page) => {
              const here = page.id === current
              const countOf = counted[page.id]
              const count = countOf && counts ? counts[countOf] : undefined
              return (
                <li key={page.id}>
                  <Link
                    to={page.path}
                    aria-current={here ? 'page' : undefined}
                    aria-describedby={`contents-${page.id}-description`}
                    onClick={() => onClose('navigate')}
                  >
                    <span className="contents-no" aria-hidden="true">
                      {page.folio}
                    </span>
                    <span className="contents-entry">
                      <span className="contents-row">
                        <span className="contents-name">{t(page.title)}</span>
                        <span className="contents-leader" aria-hidden="true" />
                        {here ? (
                          <span className="contents-here" aria-hidden="true">
                            {t('shell.here')}
                          </span>
                        ) : null}
                        <span className="contents-folio">
                          <span className="visually-hidden">{t('shell.pageNumber', { n: page.folio })}</span>
                          <span aria-hidden="true">{page.folio}</span>
                        </span>
                      </span>
                      <span className="contents-description" id={`contents-${page.id}-description`}>
                        <span>{t(page.description)}</span>
                        {count === undefined ? null : (
                          <span className="contents-count">{t(`shell.count.${countOf}`, count)}</span>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ol>
        </nav>
        <div className="contents-end">
          <button className="contents-logout" type="button" disabled={loggingOut} onClick={logOut}>
            {t('shell.logout')}
          </button>
          {logoutFailed ? (
            <p className="contents-error" role="alert">
              {t('shell.logoutFailed')}
            </p>
          ) : null}
        </div>
        <p className="contents-foot">{t('shell.swipeHint')}</p>
      </div>
    </div>
  )
}
