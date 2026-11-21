import type { MouseEvent, RefObject } from 'react'
import { Link } from 'react-router'
import { useT } from '../i18n/i18n'
import { neighbours } from './turning'
import type { RegistryPage } from './registry'
import './turn.css'

/** "Skip to the page": the first stop for the keyboard, past the masthead to
 * the page's main region. */
export function SkipLink({ main }: { main: RefObject<HTMLElement | null> }) {
  const t = useT()
  function skip(event: MouseEvent) {
    event.preventDefault()
    main.current?.focus()
  }
  return (
    <a className="turn-skip" href="#page" onClick={skip}>
      {t('shell.turn.skip')}
    </a>
  )
}

/** The foot of every page: "Previous page" and "Next page" in Contents order
 * and the folio (D2's page foot). */
export function PageFoot({ page }: { page: RegistryPage }) {
  const t = useT()
  const { previous, next } = neighbours(page)
  return (
    <footer className="turn-foot">
      <nav className="turn" aria-label={t('shell.turn.label')}>
        {previous ? (
          <Link className="turn-link" to={previous.path} rel="prev">
            <span className="kicker">{t('shell.turn.previous')}</span>
            <span className="turn-title">{t(previous.title)}</span>
          </Link>
        ) : null}
        {next ? (
          <Link className="turn-link turn-next" to={next.path} rel="next">
            <span className="kicker">{t('shell.turn.next')}</span>
            <span className="turn-title">{t(next.title)}</span>
          </Link>
        ) : null}
      </nav>
      <p className="turn-folio">
        <span className="visually-hidden">{t('shell.turn.folio', { n: page.folio })}</span>
        <span aria-hidden="true">{page.folio}</span>
      </p>
    </footer>
  )
}
