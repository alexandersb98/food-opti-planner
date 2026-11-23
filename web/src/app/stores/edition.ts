/** The edition the app is printed in: the paper edition (light), the evening
 * edition (dark), or whichever the device asks for. A per-device setting,
 * kept in local storage; the server's preferences don't hold it.
 *
 * Framework-neutral: state, `subscribe` and `getSnapshot` for
 * `useSyncExternalStore`, `set` to change it, `reset` for tests.
 *
 * The inline script in the HTML entry (web/index.html) applies
 * the stored edition before first paint with the same key and values; keep
 * the two in step. The screenshot script (web/scripts/screenshot.ts) writes
 * the same key. */

import { createState } from './state'

export type Edition = 'device' | 'paper' | 'evening'

export const EDITIONS: readonly Edition[] = ['device', 'paper', 'evening']

/** Versioned, so a later change of what is stored can start afresh. */
export const EDITION_STORAGE_KEY = 'planner.edition.v1'

/** The `data-theme` value on the root element; none follows the device. */
const THEMES: Record<Edition, 'light' | 'dark' | null> = { device: null, paper: 'light', evening: 'dark' }

function readStored(): Edition {
  try {
    const stored = localStorage.getItem(EDITION_STORAGE_KEY)
    return stored === 'paper' || stored === 'evening' ? stored : 'device'
  } catch {
    return 'device' // storage blocked
  }
}

function writeStored(edition: Edition) {
  try {
    if (edition === 'device') localStorage.removeItem(EDITION_STORAGE_KEY)
    else localStorage.setItem(EDITION_STORAGE_KEY, edition)
  } catch {
    // storage blocked: the choice lasts for this visit only
  }
}

/** Sets or removes `data-theme` on the root element, and points the
 * `theme-color` meta tags at the edition: each tag keeps its original media
 * query in `data-media` ("(prefers-color-scheme: light)"); a picked edition
 * switches its own tag on for all and the other off. */
function apply(edition: Edition) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const theme = THEMES[edition]
  if (theme) root.setAttribute('data-theme', theme)
  else root.removeAttribute('data-theme')
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const media = meta.dataset.media ?? meta.media
    meta.dataset.media = media
    meta.media = theme === null ? media : media.includes(theme) ? 'all' : 'not all'
  }
}

const edition = createState<Edition>(readStored())
// How many subscribers there are: the `storage` listener is attached only
// while there is one.
let watchers = 0

/** Another tab changed the edition. */
function onStorage(event: StorageEvent) {
  if (event.key !== EDITION_STORAGE_KEY && event.key !== null) return
  const next = readStored()
  if (next === edition.getSnapshot()) return
  apply(next)
  edition.set(next)
}

export const editionStore = {
  getSnapshot: edition.getSnapshot,

  subscribe(listener: () => void): () => void {
    if (watchers++ === 0) window.addEventListener('storage', onStorage)
    const stop = edition.subscribe(listener)
    let stopped = false
    return () => {
      if (stopped) return
      stopped = true
      stop()
      if (--watchers === 0) window.removeEventListener('storage', onStorage)
    }
  },

  set(next: Edition) {
    writeStored(next)
    apply(next)
    edition.set(next)
  },

  /** Back to what is stored (tests: before every mount). */
  reset() {
    const stored = readStored()
    apply(stored)
    edition.set(stored)
  },
}
