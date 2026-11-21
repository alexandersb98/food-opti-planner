// A value that can be watched, the base of the framework-neutral stores:
// `subscribe` and `getSnapshot` are what React's `useSyncExternalStore`
// takes. The snapshot is replaced, never changed in place, so a reader can
// compare it by reference.

export interface Readable<T> {
  /** Call `listener` after every change; returns the call that stops it. */
  subscribe: (listener: () => void) => () => void
  /** The current value. The same object until the next change. */
  getSnapshot: () => T
}

export interface State<T> extends Readable<T> {
  /** Replace the value and tell the listeners (nothing happens for the same value). */
  set: (next: T) => void
  /** Replace some fields of an object value. */
  update: (fields: Partial<T>) => void
}

export function createState<T>(initial: T): State<T> {
  let value = initial
  const listeners = new Set<() => void>()

  function set(next: T) {
    if (Object.is(next, value)) return
    value = next
    for (const listener of [...listeners]) listener()
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => value,
    set,
    update: (fields) => set({ ...value, ...fields }),
  }
}
