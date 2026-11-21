import { lazy, Suspense, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../../i18n/i18n'

// The sheet is its own chunk, fetched when the entry is pointed at or
// focused (so it is usually there by the time it is chosen).
const load = () => import('./AddFromSource')
const AddFromSource = lazy(async () => ({ default: (await load()).AddFromSource }))
const preload = () => void load()

/**
 * "Add from data source", an entry of the Ingredients page's add menu: it
 * opens the full-screen Add from data source sheet. The sheet is rendered
 * on the body, as the menu's list hides once an entry is chosen; closing it
 * gives focus back to `returnFocus` (the menu's toggle).
 */
export function AddFromSourceEntry({ returnFocus }: { returnFocus?: RefObject<HTMLElement | null> }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  // Each opening starts afresh: no chosen food, no old search.
  const [session, setSession] = useState(0)

  const show = () => {
    setSession((was) => was + 1)
    setOpen(true)
  }

  return (
    <>
      <button type="button" className="ingr-add-entry" onPointerEnter={preload} onFocus={preload} onClick={show}>
        {t('addFromSource.button')}
      </button>
      {session > 0
        ? createPortal(
            <Suspense fallback={null}>
              <AddFromSource key={session} open={open} onClose={() => setOpen(false)} returnFocus={returnFocus} />
            </Suspense>,
            document.body,
          )
        : null}
    </>
  )
}
