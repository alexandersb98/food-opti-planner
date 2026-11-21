import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useT } from '../../i18n/i18n'
import './rule-tag.css'

export type RuleMode = 'never' | 'only'

/**
 * A recipe filter as a rule tag (D2's .rule-tag): "Never: pork" with the
 * tag struck through in red, or "Only: weeknight" in reverse. Read out as
 * "Never: pork". With `onClick` it is a button (e.g. opening the filters
 * sheet); otherwise plain text.
 *
 * ```tsx
 * <RuleTag mode="never" tag="Pork" onClick={openFilters} />
 * ```
 */
export function RuleTag({
  mode,
  tag,
  note,
  onClick,
  ...props
}: {
  mode: RuleMode
  tag: string
  /** A short italic note after the tag. */
  note?: ReactNode
  onClick?: () => void
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type' | 'children'>) {
  const t = useT()
  const body = (
    <>
      <span className="rule-tag-mode">
        {t(`recipeFilters.mode.${mode}`)}
        <span className="visually-hidden">:</span>
      </span>{' '}
      <span className="rule-tag-name">{tag}</span>
      {note ? <span className="rule-tag-note">{note}</span> : null}
    </>
  )
  const className = `rule-tag rule-tag-${mode}`
  if (!onClick) return <span className={className}>{body}</span>
  return (
    <button type="button" className={`${className} rule-tag-button`} onClick={onClick} {...props}>
      {body}
    </button>
  )
}
