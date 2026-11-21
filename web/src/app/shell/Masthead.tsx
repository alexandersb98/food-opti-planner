import { useEffect, useState, type Ref } from 'react'
import { Link } from 'react-router'
import { useT } from '../i18n/i18n'
import type { RegistryPage } from './registry'
import { useRunningHeadOverride } from './runningHead'

/** How far down the page the wordmark gives way to the running head (D2). */
const SCROLLED_PX = 160

function useScrolledPast(px: number): boolean {
  const [past, setPast] = useState(false)
  useEffect(() => {
    const update = () => setPast(window.scrollY > px)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [px])
  return past
}

/** The masthead: the wordmark (home to the brief), which gives way to the
 * running head (folio and page name) once the page is scrolled, and the
 * Contents button. */
export function Masthead({
  page,
  contentsOpen,
  onContents,
  contentsButton,
}: {
  page: RegistryPage | undefined
  contentsOpen: boolean
  onContents: () => void
  contentsButton: Ref<HTMLButtonElement>
}) {
  const t = useT()
  const scrolled = useScrolledPast(SCROLLED_PX)
  const override = useRunningHeadOverride()
  const article = t('shell.wordmarkArticle')
  const run = override ?? (page ? t(page.run) : null)

  return (
    <header className="masthead" data-scrolled={scrolled || undefined}>
      <Link className="masthead-wordmark" to="/" aria-label={t('shell.wordmarkLabel')}>
        <span className="masthead-name" translate="no">
          {article ? <em className="masthead-article">{article} </em> : null}
          {t('shell.wordmarkName')}
        </span>
        {/* the page's name is its heading for assistive technology; this
            is the printed reminder of it */}
        <span className="masthead-run" aria-hidden="true">
          {page ? <span className="masthead-folio">{page.folio}</span> : null}
          {run}
        </span>
      </Link>
      <button
        ref={contentsButton}
        className="masthead-contents"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={contentsOpen}
        aria-controls={contentsOpen ? 'contents' : undefined}
        onClick={onContents}
      >
        <span className="masthead-contents-icon" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>{t('shell.contents')}</span>
      </button>
    </header>
  )
}
