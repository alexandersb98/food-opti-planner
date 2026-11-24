// Where the line editor puts the focus: the ids of the elements it moves
// the focus to, and the one target it is asked to move it to next.

/** The ids the editor moves the focus to. */
export const lineIds = {
  amount: (key: number) => `line-${key}-amount`,
  unit: (key: number) => `line-${key}-unit`,
  more: (key: number) => `line-${key}-more`,
  add: (key: number) => `section-${key}-add`,
  name: (key: number) => `section-${key}-name`,
}

/** Where the focus goes next, by element id, and a ref that looks it up
 * when read: for a sheet's final focus on an element drawn after the sheet
 * opened. */
export function focusTarget() {
  let next = ''
  return {
    /** Ask for the focus on the element with `id` once it is drawn. */
    set(id: string) {
      next = id
    },
    /** Whether a focus is asked for and not yet given: most renders ask
     * for none, and need not look at the page. */
    wanted(): boolean {
      return next !== ''
    },
    /** The element asked for, if it is drawn; asks no more once it is. */
    take(): HTMLElement | null {
      const target = next ? document.getElementById(next) : null
      if (target) next = ''
      return target
    },
    /** For a sheet's final focus: read once, as it closes; the element is
     * brought into view once the sheet has gone. */
    ref: {
      get current() {
        const target = next ? document.getElementById(next) : null
        next = ''
        if (target) requestAnimationFrame(() => target.scrollIntoView?.({ block: 'center' }))
        return target
      },
    },
  }
}
