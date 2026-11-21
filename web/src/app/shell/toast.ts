// The toast: a short confirmation ("Goal changed.") shown for a moment at
// the foot of the screen and announced politely to screen readers. Pages call
// `toast(message)`; the shell's toast region shows it. Errors are not toasts:
// they go next to what failed.

export interface ToastState {
  message: string
  /** Counts up with every toast, so the same message twice is announced
   * and shown afresh. */
  id: number
  shown: boolean
}

/** How long a toast stays, in milliseconds (D2). */
export const TOAST_MS = 2800

const initial: ToastState = { message: '', id: 0, shown: false }

let state = initial
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

function set(next: ToastState) {
  state = next
  for (const listener of listeners) listener()
}

/** Shows `message`, replacing any toast still showing. */
export function toast(message: string) {
  clearTimeout(timer)
  set({ message, id: state.id + 1, shown: true })
  timer = setTimeout(() => set({ ...state, shown: false }), TOAST_MS)
}

export const toastStore = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot: () => state,
  /** Back to no toast (tests). */
  reset() {
    clearTimeout(timer)
    state = initial
  },
}
