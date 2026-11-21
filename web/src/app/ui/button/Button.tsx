import type { ComponentPropsWithRef } from 'react'
import './button.css'

export type ButtonVariant = 'outline' | 'primary' | 'accent' | 'ghost' | 'text' | 'text-plain' | 'pencil' | 'icon'

export interface ButtonLook {
  /** outline (default): ink border; primary: ink fill; accent: red-pencil
   * fill (also a confirm that removes something); ghost: hairline border;
   * text: red sans words, underlined (D2's .text-btn); text-plain: the same
   * in ink; pencil: italic serif words in red pencil, for the small actions
   * written on a page being edited ("Add a line to …"); icon: a round
   * 44 px button holding one mark (D2's .icon-btn), which needs an
   * `aria-label`. */
  variant?: ButtonVariant
  /** 44 px tall instead of 48 (outline, primary, accent and ghost). */
  small?: boolean
  /** Full width. */
  block?: boolean
}

const WORDS: Partial<Record<ButtonVariant, string>> = {
  text: 'btn-text',
  'text-plain': 'btn-text btn-plain',
  pencil: 'btn-pencil',
  icon: 'btn-icon',
}

/** The button classes, for a router `<Link>` that looks like a button:
 * `<Link className={buttonClass({ variant: 'primary' })} to="/menu">`. */
export function buttonClass({ variant = 'outline', small = false, block = false }: ButtonLook = {}, extra?: string) {
  const words = WORDS[variant]
  return [
    words ?? 'btn',
    !words && variant !== 'outline' ? `btn-${variant}` : '',
    small && !words ? 'btn-small' : '',
    block ? 'btn-block' : '',
    extra ?? '',
  ]
    .filter(Boolean)
    .join(' ')
}

/** A button in D2's look. `type` defaults to "button" (not "submit"); a
 * `ref` reaches the `<button>`. */
export function Button({
  variant,
  small,
  block,
  className,
  type = 'button',
  ...props
}: ButtonLook & ComponentPropsWithRef<'button'>) {
  return <button type={type} className={buttonClass({ variant, small, block }, className)} {...props} />
}
