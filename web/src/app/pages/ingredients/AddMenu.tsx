import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useT } from '../../i18n/i18n'
import { buttonClass } from '../../ui/button/Button'
import { AddFromSourceEntry } from '../add-from-source/AddFromSourceEntry'

/**
 * "Add an ingredient": a button that opens a short list of the ways to add
 * one (a disclosure, not an ARIA menu: the entries are ordinary links and
 * buttons, reached with Tab). Escape, a tap outside or choosing an entry
 * closes it. The list stays mounted while closed, so an entry may keep its
 * own state (e.g. a sheet it opened). One line per way to add.
 */
export function AddMenu() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const listId = useId()
  const root = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent | FocusEvent) => {
      const target = (event instanceof FocusEvent ? event.relatedTarget : event.target) as Node | null
      if (target && !root.current?.contains(target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      toggle.current?.focus()
    }
    const element = root.current
    document.addEventListener('pointerdown', outside)
    element?.addEventListener('focusout', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      element?.removeEventListener('focusout', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <div className="ingr-add" ref={root}>
      <button
        ref={toggle}
        type="button"
        className={buttonClass({ small: true }, 'ingr-add-toggle')}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((was) => !was)}
      >
        {t('ingredients.add')}
        <span className="ingr-add-caret" aria-hidden="true" />
      </button>
      {/* a click on any entry closes the list once the entry has done its part */}
      <ul id={listId} className="ingr-add-list" hidden={!open} onClick={() => setOpen(false)}>
        <li>
          <Link className="ingr-add-entry" to="/ingredients/new">
            {t('ingredients.new')}
          </Link>
        </li>
        <li>
          <AddFromSourceEntry returnFocus={toggle} />
        </li>
      </ul>
    </div>
  )
}
