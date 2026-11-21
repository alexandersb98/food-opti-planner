import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from 'react'
import { useT } from '../../i18n/i18n'
import './sheet.css'

export interface SheetProps {
  /** Whether the sheet is open. Setting it to false closes the sheet with
   * its closing animation (without asking `beforeClose`). */
  open: boolean
  /** The reader asked to close: the close button, Escape or a tap outside,
   * after `beforeClose` agreed. The caller sets `open` to false. */
  onClose: () => void
  title: ReactNode
  children: ReactNode
  /** Asked before the reader closes the sheet (not when `open` turns false);
   * a dirty form answers false (or a promise of false) to stay open. */
  beforeClose?: () => boolean | Promise<boolean>
  /** Fills the screen (the page column on a desktop) instead of sliding up
   * to fit its content. */
  fullScreen?: boolean
  /** Where focus goes on opening; the title by default. */
  initialFocus?: RefObject<HTMLElement | null>
  /** Where focus goes on closing; what had focus before it opened by default
   * (when it is still on the page). */
  finalFocus?: RefObject<HTMLElement | null>
  /** `alertdialog` for a question that needs an answer (Confirm). */
  role?: 'dialog' | 'alertdialog'
  /** The id of the element that describes the sheet, if any. */
  describedBy?: string
}

/** A bottom sheet (D2's sheet) on a native `dialog` opened modally: focus
 * moves in and is trapped, Escape and a tap outside close it, the page does
 * not scroll behind it, and focus returns to what opened it. It slides up
 * and back down, without motion when the reader asks for reduced motion.
 * Centred and as wide as the page on a desktop. */
export function Sheet(props: SheetProps) {
  // The dialog stays on the page after `open` turns false until its closing
  // animation has played.
  const [shown, setShown] = useState(props.open)
  if (props.open && !shown) setShown(true)
  if (!shown) return null
  return <SheetDialog {...props} onExited={() => setShown(false)} />
}

const focusableSelector = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ')

/** The dialog's own tab stops in order, leaving out those of a dialog opened
 * inside it (a Confirm asked from a sheet) and hidden ones. */
function tabStops(dialog: HTMLDialogElement): HTMLElement[] {
  // Matched element by element: jsdom's querySelectorAll with a selector list
  // does not keep document order.
  return [...dialog.querySelectorAll<HTMLElement>('*')].filter(
    (el) =>
      el.matches(focusableSelector) &&
      el.closest('dialog') === dialog &&
      !el.closest('[hidden], [inert]') &&
      (el.checkVisibility?.() ?? true),
  )
}

interface OpenSheet {
  dialog: HTMLDialogElement
  /** What had focus when it opened, and gets it back when it closes. */
  opener: Element | null
}

/** The sheets on the page, in the order they opened. */
const openSheets: OpenSheet[] = []

/** True when the event happened in this dialog rather than in a dialog
 * opened inside it. */
function isOwn(event: SyntheticEvent<HTMLDialogElement>) {
  return event.target instanceof Element && event.target.closest('dialog') === event.currentTarget
}

function SheetDialog({
  open,
  onClose,
  title,
  children,
  beforeClose,
  fullScreen = false,
  initialFocus,
  finalFocus,
  role,
  describedBy,
  onExited,
}: SheetProps & { onExited: () => void }) {
  const t = useT()
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  // A tap closes only when it both starts and ends outside the panel (a text
  // selection dragged out of the panel is not a tap outside).
  const pressedOutside = useRef(false)
  const asking = useRef(false)
  const entryRef = useRef<OpenSheet | null>(null)

  const focusOnOpen = useEffectEvent(() => {
    ;(initialFocus?.current ?? titleRef.current)?.focus({ preventScroll: true })
  })
  const focusOnClose = useEffectEvent((opener: Element | null) => {
    const target = finalFocus?.current ?? opener
    if (target instanceof HTMLElement && target !== document.body && target.isConnected) target.focus({ preventScroll: true })
  })
  const exited = useEffectEvent(onExited)

  // Open modally once the dialog is on the page; close and give focus back
  // when it leaves (also when the caller unmounts it at once).
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const entry: OpenSheet = { dialog, opener: document.activeElement }
    entryRef.current = entry
    openSheets.push(entry)
    if (!dialog.open) dialog.showModal()
    focusOnOpen()
    return () => {
      openSheets.splice(openSheets.indexOf(entry), 1)
      // A sheet opened from this one (a Confirm) now returns focus to where
      // this one would have.
      for (const above of openSheets) {
        if (above.opener && dialog.contains(above.opener)) above.opener = entry.opener
      }
      // Give focus back only when it is still ours: a sheet closing under a
      // Confirm (or after focus moved on) leaves it where it is.
      const focused = document.activeElement
      const ours = !focused || focused === document.body || dialog.contains(focused)
      if (dialog.open) dialog.close()
      if (ours) focusOnClose(entry.opener)
    }
  }, [])

  /** Stops being modal (the page under it is no longer inert) but stays
   * drawn for its closing animation, and gives the focus back now. Only for
   * the bottom sheet: one closing above another (a Confirm) stays modal, so
   * its fade is not drawn under the sheet below. */
  const releaseFocus = useEffectEvent(() => {
    const dialog = dialogRef.current
    const entry = entryRef.current
    if (!dialog || !entry || !dialog.open) return
    if (openSheets.some((other) => other !== entry && other.dialog.open)) return
    const focused = document.activeElement
    const ours = !focused || focused === document.body || dialog.contains(focused)
    dialog.close()
    dialog.show()
    if (ours) focusOnClose(entry.opener)
  })

  // Closing: the page is the reader's again at once (what they type next,
  // such as a new line's amount, goes where the focus went), while the sheet
  // slides down and fades (none with reduced motion, or where animations are
  // not run); then it leaves the page.
  useEffect(() => {
    if (open) return
    releaseFocus()
    let current = true
    const animations = [dialogRef.current, panelRef.current].flatMap((el) => el?.getAnimations?.() ?? [])
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (current) exited()
    })
    return () => {
      current = false
    }
  }, [open])

  async function requestClose() {
    if (!open || asking.current) return
    if (beforeClose) {
      asking.current = true
      try {
        if (!(await beforeClose())) return
      } finally {
        asking.current = false
      }
    }
    onClose()
  }

  function keepTabInside(event: KeyboardEvent<HTMLDialogElement>) {
    const dialog = event.currentTarget
    const stops = tabStops(dialog)
    if (!stops.length) {
      event.preventDefault()
      return
    }
    const first = stops[0]
    const last = stops[stops.length - 1]
    const active = document.activeElement
    const at = stops.indexOf(active as HTMLElement)
    if (event.shiftKey ? at <= 0 : at === stops.length - 1 || !dialog.contains(active)) {
      event.preventDefault()
      ;(event.shiftKey ? last : first).focus()
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (!isOwn(event)) return
    if (event.key === 'Escape') {
      // Handled here, so the browser's own cancel does not close the dialog
      // and the shell's Escape (Contents) does not see it.
      event.preventDefault()
      event.stopPropagation()
      void requestClose()
    } else if (event.key === 'Tab') {
      keepTabInside(event)
    }
  }

  function onCancel(event: SyntheticEvent<HTMLDialogElement>) {
    // A close request without a key press (a phone's back gesture).
    event.preventDefault()
    if (isOwn(event)) void requestClose()
  }

  function onPointerDown(event: PointerEvent<HTMLDialogElement>) {
    pressedOutside.current = event.target === event.currentTarget
  }

  function onMouseDown(event: MouseEvent<HTMLDialogElement>) {
    // A press outside the panel keeps focus where it is (a field being
    // edited when beforeClose says no).
    if (event.target === event.currentTarget) event.preventDefault()
  }

  function onClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget && pressedOutside.current) void requestClose()
    pressedOutside.current = false
  }

  return (
    <dialog
      ref={dialogRef}
      className={fullScreen ? 'sheet sheet-full' : 'sheet'}
      role={role}
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      data-closing={open ? undefined : ''}
      data-no-swipe=""
      onKeyDown={onKeyDown}
      onCancel={onCancel}
      onPointerDown={onPointerDown}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      <div ref={panelRef} className="sheet-panel">
        <div className="sheet-grip" aria-hidden="true" />
        <header className="sheet-head">
          <h2 ref={titleRef} id={titleId} className="sheet-title" tabIndex={-1}>
            {title}
          </h2>
          <button type="button" className="sheet-close" aria-label={t('sheet.close')} onClick={() => void requestClose()}>
            {closeIcon}
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </dialog>
  )
}

const closeIcon = (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.5" fill="none" />
  </svg>
)
