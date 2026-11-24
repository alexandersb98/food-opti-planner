/** The launch splash (#splash in web/index.html): painted with the HTML, so
 * a home-screen launch shows the paper at once instead of a blank screen
 * while the server wakes. It fades out once the router has its first page,
 * which for the shell means the session check has answered. */

/** The part of a data router this needs. */
export interface StartingRouter {
  state: { initialized: boolean }
  subscribe(listener: (state: { initialized: boolean }) => void): () => void
}

/** Fade the splash out and remove it (at once if motion is reduced or the
 * fade's end never comes). */
export function hideSplash(doc: Document = document): void {
  const splash = doc.getElementById('splash')
  if (!splash) return
  const remove = () => splash.remove()
  splash.classList.add('splash-out')
  splash.addEventListener('transitionend', remove, { once: true })
  window.setTimeout(remove, 400) // no transition (reduced motion), or it was cut short
}

/** Hide the splash when `router` has loaded its first page. */
export function hideSplashWhenReady(router: StartingRouter, doc: Document = document): void {
  if (router.state.initialized) {
    hideSplash(doc)
    return
  }
  const unsubscribe = router.subscribe((state) => {
    if (!state.initialized) return
    unsubscribe()
    hideSplash(doc)
  })
}
