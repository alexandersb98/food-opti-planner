import { useT } from '../i18n/i18n'
import './wordmark.css'

/** The paper's name as the masthead sets it ("*The* Weekly Table"), shared by
 * the masthead and the login page. */
export function Wordmark({ className }: { className?: string }) {
  const t = useT()
  const article = t('shell.wordmarkArticle')
  return (
    <span className={className ? `wordmark ${className}` : 'wordmark'} translate="no">
      {article ? <em className="wordmark-article">{article} </em> : null}
      {t('shell.wordmarkName')}
    </span>
  )
}
