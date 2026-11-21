import type { ButtonHTMLAttributes, ReactNode } from 'react'
import './chips.css'

/**
 * A wrapping row of chips (D2's .chips). Name it with `label` or
 * `labelledBy`, or leave both out inside a `Fieldset`.
 *
 * ```tsx
 * <Chips label={t('recipes.tags')}>
 *   {tags.map((tag) => (
 *     <Chip key={tag.id} pressed={chosen.has(tag.id)} onClick={() => toggle(tag.id)}>{tag.name}</Chip>
 *   ))}
 * </Chips>
 * ```
 *
 * For one choice of many (the goal's attribute), press the chosen chip and
 * set the choice on click; for several, toggle.
 */
export function Chips({
  label,
  labelledBy,
  className,
  children,
}: {
  label?: string
  labelledBy?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={className ? `chips ${className}` : 'chips'}
      role="group"
      aria-label={label}
      aria-labelledby={labelledBy}
      data-no-swipe=""
    >
      {children}
    </div>
  )
}

/** A toggle chip: pressed is filled in ink. A disabled chip is dashed; with
 * `note` (e.g. "auto" for a tag the recipe gets from its ingredients) the
 * note follows the name in italics. */
export function Chip({
  pressed,
  note,
  className,
  children,
  ...props
}: {
  pressed: boolean
  note?: ReactNode
  children: ReactNode
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'aria-pressed'>) {
  return (
    <button type="button" className={className ? `chip ${className}` : 'chip'} aria-pressed={pressed} {...props}>
      {children}
      {note ? <span className="chip-note">{note}</span> : null}
    </button>
  )
}
