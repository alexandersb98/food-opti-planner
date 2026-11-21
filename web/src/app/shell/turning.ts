import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router'
import { registry, type RegistryPage } from './registry'

// Turning pages like a book: swipes to the next or previous page in Contents
// order, the page-enter slide in the direction moved, and the scroll
// position of a page turn (the top for a new page, where it was for Back).

/** The pages before and after this one in Contents order (a detail route
 * turns from the registry page it belongs to). */
export function neighbours(page: RegistryPage): { previous?: RegistryPage; next?: RegistryPage } {
  return { previous: registry[page.folio - 2], next: registry[page.folio] }
}

/** Where a swipe that starts here is ignored: anything typed into or chosen
 * from, dialogs, and whatever says so with `data-no-swipe` (grids,
 * segmented controls, chip rows, sheets, an editing spread). */
const NO_SWIPE =
  'input, textarea, select, dialog, [role="dialog"], [role="alertdialog"], [contenteditable]:not([contenteditable="false"]), [data-no-swipe]'

/** A swipe is a quick, mostly sideways stroke (D2's thresholds). */
const SWIPE_MIN_X = 70
const SWIPE_MAX_Y = 50
const SWIPE_MAX_MS = 600

/** Swipes on `region` turn to the next (leftwards) or previous (rightwards)
 * page. Touch only, with passive listeners: a swipe never blocks scrolling. */
function useSwipeToTurn(region: RefObject<HTMLElement | null>, page: RegistryPage | undefined) {
  const navigate = useNavigate()
  const folio = page?.folio
  useEffect(() => {
    const element = region.current
    if (!element || folio === undefined) return
    let start: { x: number; y: number; at: number } | null = null
    const onStart = (event: TouchEvent) => {
      const target = event.target
      const ignored = event.touches.length !== 1 || (target instanceof Element && target.closest(NO_SWIPE))
      const touch = event.touches[0]
      start = ignored || !touch ? null : { x: touch.clientX, y: touch.clientY, at: event.timeStamp }
    }
    const onEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0]
      const from = start
      start = null
      if (!from || !touch) return
      const dx = touch.clientX - from.x
      const dy = touch.clientY - from.y
      if (Math.abs(dx) < SWIPE_MIN_X || Math.abs(dy) > SWIPE_MAX_Y || event.timeStamp - from.at > SWIPE_MAX_MS) return
      const target = registry[folio - 1 + (dx < 0 ? 1 : -1)]
      if (target) void navigate(target.path)
    }
    const onCancel = () => {
      start = null
    }
    element.addEventListener('touchstart', onStart, { passive: true })
    element.addEventListener('touchend', onEnd, { passive: true })
    element.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      element.removeEventListener('touchstart', onStart)
      element.removeEventListener('touchend', onEnd)
      element.removeEventListener('touchcancel', onCancel)
    }
  }, [region, folio, navigate])
}

/** A page's place in the book for the slide's direction: its folio, a detail
 * route just after the page it belongs to. */
function place(page: RegistryPage | undefined, pathname: string): number {
  if (!page) return 0
  return page.folio + (pathname === page.path ? 0 : 0.5)
}

/** Whether motion is to be kept to a minimum (no matchMedia, as in jsdom: no). */
function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Positions scrolled to, by history entry, for Back and Forward. */
const scrolled = new Map<string, number>()

/** On a page change: start at the top (or, for Back and Forward, where that
 * page was left), and slide the new page in from the side it lies on. None
 * of it on the first page shown, nor on a change of query only. */
function usePageEnter(region: RefObject<HTMLElement | null>, page: RegistryPage | undefined) {
  const { pathname, key } = useLocation()
  const navigationType = useNavigationType()
  const shown = useRef<{ pathname: string; place: number } | null>(null)
  const entry = useRef(key)

  // the browser's own restoring would fight ours
  useEffect(() => {
    if (!('scrollRestoration' in history)) return
    const before = history.scrollRestoration
    history.scrollRestoration = 'manual'
    return () => {
      history.scrollRestoration = before
    }
  }, [])

  useEffect(() => {
    const remember = () => scrolled.set(entry.current, window.scrollY)
    window.addEventListener('scroll', remember, { passive: true })
    return () => window.removeEventListener('scroll', remember)
  }, [])

  useLayoutEffect(() => {
    entry.current = key
    const before = shown.current
    const now = place(page, pathname)
    if (before?.pathname === pathname) return
    shown.current = { pathname, place: now }
    if (!before) return

    const top = (navigationType === 'POP' && scrolled.get(key)) || 0
    if (window.scrollY !== top) window.scrollTo(0, top)

    const element = region.current
    if (!element || reducedMotion()) return
    element.removeAttribute('data-enter')
    void element.offsetWidth // restart the animation if a turn is still sliding in
    element.setAttribute('data-enter', now < before.place ? 'previous' : 'next')
  }, [region, page, pathname, key, navigationType])

  useEffect(() => {
    const element = region.current
    if (!element) return
    // once in, the page keeps no transform (fixed children stay fixed)
    const done = (event: AnimationEvent) => {
      if (event.target === element) element.removeAttribute('data-enter')
    }
    element.addEventListener('animationend', done)
    return () => element.removeEventListener('animationend', done)
  }, [region])
}

/** Page turning for the shell's page region: swipes, the scroll position and
 * the page-enter slide. */
export function usePageTurns(region: RefObject<HTMLElement | null>, page: RegistryPage | undefined) {
  useSwipeToTurn(region, page)
  usePageEnter(region, page)
}
