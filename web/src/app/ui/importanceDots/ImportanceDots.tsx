import { useT } from '../../i18n/i18n'
import './importance-dots.css'

/**
 * Importance as filled dots (D2's .imp): `value` of `max` in red pencil,
 * read out as "Importance 3 of 5". Pass `label` for a different reading,
 * e.g. `t('goals.importanceSplit', {...})` beside a split importance.
 */
export function ImportanceDots({ value, max = 5, label }: { value: number; max?: number; label?: string }) {
  const t = useT()
  const dots = Array.from({ length: max }, (_, i) => i < value)
  return (
    <span className="dots" role="img" aria-label={label ?? t('goals.importanceOf', { n: value, max })}>
      {dots.map((on, i) => (
        <i key={i} className={on ? 'dots-dot dots-on' : 'dots-dot'} />
      ))}
    </span>
  )
}
