import { useEffect, useRef, type RefObject } from 'react'
import { useBlocker } from 'react-router'
import { useT } from '../../i18n/i18n'
import { useConfirm } from '../../ui/confirm/Confirm'

/**
 * Leaving an imported recipe before it is saved asks "Discard this
 * recipe?" (Keep editing / Discard), and a reload or a closed tab warns.
 * `done` is set once the recipe is saved (or discarded), so its own
 * navigation goes straight on.
 */
export function LeaveGuard({ done }: { done: RefObject<boolean> }) {
  const t = useT()
  const [confirm, confirmSheet] = useConfirm()
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => !done.current && currentLocation.pathname !== nextLocation.pathname,
  )
  const asking = useRef(false)

  useEffect(() => {
    if (blocker.state !== 'blocked' || asking.current) return
    asking.current = true
    void confirm({
      title: t('recipes.leaveTitle'),
      message: <p>{t('recipes.leaveBody')}</p>,
      confirmLabel: t('recipes.discard'),
      cancelLabel: t('recipes.keepEditing'),
      destructive: true,
    }).then((discard) => {
      asking.current = false
      if (discard) {
        done.current = true
        blocker.proceed()
      } else blocker.reset()
    })
  }, [blocker, confirm, done, t])

  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (!done.current) event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [done])

  return confirmSheet
}
