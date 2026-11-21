import { Link } from 'react-router'
import { useT } from '../i18n/i18n'

/** An address the app doesn't have, inside the shell. */
export function NotFound() {
  const t = useT()
  return (
    <article className="page-stub">
      <h1 className="page-stub-title">{t('shell.notFound.title')}</h1>
      <p className="lead-text">{t('shell.notFound.text')}</p>
      <p className="page-stub-path">
        <Link to="/">{t('shell.notFound.home')}</Link>
      </p>
    </article>
  )
}
