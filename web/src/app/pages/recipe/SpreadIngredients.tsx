import { memo, useMemo } from 'react'
import type { Ingredient, Recipe } from '../../../api/types'
import type { Ratio } from '../../../lineUnits'
import { useT } from '../../i18n/i18n'
import { spreadSections, type SpreadLine } from './spread'

/**
 * The recipe's ingredients, read-only: per section (headed only when there
 * are several or it has a name) the amount, the unit and the name, with a
 * line whose ingredient is gone or whose unit doesn't convert flagged. The
 * edit mode shows these too until ticket 33's line editor takes its place.
 */
export const SpreadIngredients = memo(function SpreadIngredients({
  recipe,
  ingredients,
  ratio,
}: {
  recipe: Recipe
  ingredients: ReadonlyMap<number, Ingredient>
  ratio: Ratio | null
}) {
  const t = useT()
  const sections = useMemo(
    () => spreadSections(recipe, ingredients, ratio, (n) => t('recipes.sectionN', { n })),
    [recipe, ingredients, ratio, t],
  )
  return sections.map((section, index) => (
    <div className="spread-ing-section" key={index}>
      {section.heading !== null ? <h3>{section.heading}</h3> : null}
      <ul className="spread-lines">
        {section.lines.map((line, i) => (
          <Line key={i} line={line} />
        ))}
      </ul>
    </div>
  ))
})

function Line({ line }: { line: SpreadLine }) {
  const t = useT()
  return (
    <li className={line.flag ? 'spread-line spread-line-flagged' : 'spread-line'}>
      <span className="spread-amt">
        {line.amount}
        {line.unit ? <span className="spread-unit"> {line.unit}</span> : null}
      </span>
      <span className="spread-nm">
        {line.flag === 'missing' ? line.originalText || t('recipe.missingName') : line.name}
        {line.flag === 'missing' ? <span className="spread-flag">{t('recipe.missing')}</span> : null}
        {line.flag === 'unconvertible' ? (
          <span className="spread-flag">{t('recipe.unconvertible', { unit: line.unit, own: line.own })}</span>
        ) : null}
      </span>
    </li>
  )
}
