import { useSyncExternalStore } from 'react'
import { toastStore } from './toast'

/** The toast region: always in the page (a live region must exist before
 * its text changes to be announced), showing the latest `toast()`. */
export function Toast() {
  const { message, id, shown } = useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot)
  return (
    <div className="toast" role="status" aria-live="polite" aria-atomic="true" data-shown={shown || undefined}>
      {/* keyed by id: the same message twice is new text to announce; the
          text stays while the toast fades out */}
      {message ? <span key={id}>{message}</span> : null}
    </div>
  )
}
