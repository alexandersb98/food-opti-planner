import type { ButtonHTMLAttributes } from 'react'
import './button.css'

export type ButtonVariant = 'outline' | 'primary' | 'accent' | 'ghost' | 'text' | 'text-plain'

export interface ButtonLook {
  /** outline (default): ink border; primary: ink fill; accent: red-pencil
   * fill; ghost: hairline border; text: red sans words (D2's text button);
   * text-plain: the same in ink. */
  variant?: ButtonVariant
  /** 44 px tall instead of 48 (outline, primary, accent and ghost). */
  small?: boolean
  /** Full width. */
  block?: boolean
}

/** The button classes, for a router `<Link>` that looks like a button:
 * `<Link className={buttonClass({ variant: 'primary' })} to="/menu">`. */
export function buttonClass({ variant = 'outline', small = false, block = false }: ButtonLook = {}, extra?: string) {
  const text = variant === 'text' || variant === 'text-plain'
  return [
    text ? 'btn-text' : 'btn',
    variant === 'text-plain' ? 'btn-plain' : !text && variant !== 'outline' ? `btn-${variant}` : '',
    small && !text ? 'btn-small' : '',
    block ? 'btn-block' : '',
    extra ?? '',
  ]
    .filter(Boolean)
    .join(' ')
}

/** A button in D2's look. `type` defaults to "button" (not "submit"). */
export function Button({
  variant,
  small,
  block,
  className,
  type = 'button',
  ...props
}: ButtonLook & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={buttonClass({ variant, small, block }, className)} {...props} />
}
