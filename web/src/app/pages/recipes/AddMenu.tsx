import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { buttonClass } from '../../ui/button/Button'

export interface AddMenuItem {
  /** Where the item leads. */
  to: string
  label: string
  /** A line under the label saying what the item does. */
  hint?: string
  /** Shown but not followed; `hint` then says why. */
  disabled?: boolean
}

/**
 * A button that opens a short list of ways to add something (a new recipe,
 * or one imported), as a disclosure: the button says whether the list is
 * open and the list opens in place below it, its items links. Escape closes
 * it and puts focus back on the button, as do a click or focus outside it.
 * A disabled item is not a link and says why in its hint.
 */
export function AddMenu({ label, items }: { label: string; items: readonly AddMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    root.current?.scrollIntoView?.({ block: 'nearest' })
    // a press outside closes it (some browsers don't focus a pressed button,
    // so the focus test below doesn't catch every press)
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      event.stopPropagation()
      setOpen(false)
      button.current?.focus()
    }
  }

  function onBlur(event: FocusEvent) {
    if (event.relatedTarget && !root.current?.contains(event.relatedTarget as Node)) setOpen(false)
  }

  return (
    <div className="recipes-add" ref={root} onKeyDown={onKeyDown} onBlur={onBlur}>
      <button
        ref={button}
        type="button"
        className={buttonClass({ block: true }, 'recipes-add-button')}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((was) => !was)}
      >
        {label}
        <svg className="recipes-add-caret" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M3 5.5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
      <ul id={listId} className="recipes-add-list" hidden={!open}>
        {items.map((item) => (
          <li key={item.to}>
            {item.disabled ? (
              <span className="recipes-add-item" aria-disabled="true">
                <span className="recipes-add-label">{item.label}</span>
                {item.hint ? <span className="recipes-add-hint">{item.hint}</span> : null}
              </span>
            ) : (
              <Link className="recipes-add-item" to={item.to}>
                <span className="recipes-add-label">{item.label}</span>
                {item.hint ? <span className="recipes-add-hint">{item.hint}</span> : null}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
