import { useLocation } from 'react-router'
import { useT } from '../i18n/i18n'

/** Stands in for a page until its ticket builds it: the page's title (a
 * message key) and the address it was reached at. */
export function PageStub({ title }: { title: string }) {
  const t = useT()
  const { pathname, search } = useLocation()
  return (
    <article className="page-stub">
      <h1 className="page-stub-title">{t(title)}</h1>
      <p className="kicker">{t('shell.stub.note')}</p>
      <p className="page-stub-path">
        <code>{pathname + search}</code>
      </p>
    </article>
  )
}
