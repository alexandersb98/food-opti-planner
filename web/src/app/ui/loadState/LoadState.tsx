import type { Load } from '../../hooks/useLoad'
import { useT } from '../../i18n/i18n'
import { Button } from '../button/Button'
import './load-state.css'

/**
 * What a page shows instead of its content while its data loads or after
 * the load failed: a quiet "Loading…" line (it fades in only if the wait is
 * noticeable), or the failure with "Try again". Shows nothing once loaded.
 *
 * ```tsx
 * const page = useLoad(() => api.GET('/api/tags'))
 * if (!page.data) return <LoadState of={page} message={t('tags.loadFailed')} />
 * ```
 */
export function LoadState({
  of,
  message,
}: {
  /** The load (from `useLoad`), or any object with the same three fields. */
  of: Pick<Load<unknown>, 'loading' | 'failed' | 'reload'>
  /** What failed, e.g. "Could not load the tags."; a general line otherwise. */
  message?: string
}) {
  const t = useT()
  if (of.failed) {
    return (
      <div className="load-failed" role="alert">
        <p className="load-message">{message ?? t('ui.loadFailed')}</p>
        <Button onClick={of.reload}>{t('common.retry')}</Button>
      </div>
    )
  }
  if (of.loading) {
    return (
      <p className="load-loading" role="status">
        {t('ui.loading')}
      </p>
    )
  }
  return null
}
