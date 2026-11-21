import { useMemo } from 'react'
import type { Ingredient } from '../../../api/types'
import type { Ratio } from '../../../lineUnits'
import { useT } from '../../i18n/i18n'
import type { SpreadData } from './RecipeSpread'
import { SpreadIngredients } from './SpreadIngredients'
import { methodSteps, portionText, sectionNumeral, sourceLink, spreadTags, spreadTotals } from './spread'

/**
 * The spread in view mode: the head (kicker, name, servings and portions),
 * the ingredients, the method, and the notes (tags, the per-portion
 * nutrition table and the source).
 */
export function SpreadView({
  data,
  ingredients,
  ratio,
}: {
  data: SpreadData
  ingredients: ReadonlyMap<number, Ingredient>
  /** The unit catalogue's ratio; null while it isn't known. */
  ratio: Ratio | null
}) {
  const t = useT()
  const { recipe, attributes, tags } = data
  const totals = useMemo(() => spreadTotals(recipe, attributes, ingredients, ratio), [recipe, attributes, ingredients, ratio])
  const tagged = useMemo(() => spreadTags(recipe, tags), [recipe, tags])
  const steps = useMemo(() => methodSteps(recipe.instructions), [recipe.instructions])
  const derived = tagged.filter(({ derived }) => derived).map(({ tag }) => tag.name)
  const source = sourceLink(recipe.source_url)
  const first = tagged[0]?.tag.name
  let n = 0

  return (
    <>
      <header className="spread-head">
        <p className="kicker">
          {first ? t('recipe.kickerFiled', { n: recipe.id, tag: first }) : t('recipe.kicker', { n: recipe.id })}
        </p>
        <h1 id="spread-title" className="spread-title display">
          {recipe.name}
        </h1>
        <dl className="spread-meta">
          <div>
            <dt>{t('recipe.serves')}</dt>
            <dd>{recipe.servings}</dd>
          </div>
          <div>
            <dt>{t('recipe.portions')}</dt>
            <dd>
              {t('recipe.portionRange', { from: portionText(recipe.min_multiplier), to: portionText(recipe.max_multiplier) })}
              {recipe.step !== null ? (
                <small>{t('recipe.portionSteps', { step: portionText(recipe.step) })}</small>
              ) : null}
            </dd>
          </div>
        </dl>
      </header>

      <section className="spread-sec" aria-labelledby="spread-ingredients">
        <SectionHead id="spread-ingredients" n={++n} title={t('recipe.ingredients')} />
        <SpreadIngredients recipe={recipe} ingredients={ingredients} ratio={ratio} />
      </section>

      {steps.length > 0 ? (
        <section className="spread-sec" aria-labelledby="spread-method">
          <SectionHead id="spread-method" n={++n} title={t('recipe.method')} />
          <ol className="spread-method">
            {steps.map((step, i) => (
              <li key={i}>
                <p>{step}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="spread-sec" aria-labelledby="spread-notes">
        <SectionHead id="spread-notes" n={++n} title={t('recipe.notes')} />
        {tagged.length > 0 ? (
          <div className="spread-tags">
            <h3 className="kicker">{t('recipe.tags')}</h3>
            <ul className="spread-tag-line">
              {tagged.map(({ tag }) => (
                <li key={tag.id}>{tag.name}</li>
              ))}
            </ul>
            {derived.length > 0 ? (
              <p className="spread-derived">{t('recipe.fromIngredients', { tags: derived.join(', ') })}</p>
            ) : null}
          </div>
        ) : null}

        {attributes.length > 0 ? (
          <table className="spread-nutri">
            <caption>{t('recipe.perPortion')}</caption>
            <tbody>
              {attributes.map((attribute) => (
                <tr key={attribute.id}>
                  <th scope="row">{attribute.name}</th>
                  <td>{`${totals.get(attribute.id) ?? '0'} ${attribute.unit}`.trim()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="spread-none">{t('ingredients.noAttributes')}</p>
        )}

        {source ? (
          <p className="spread-source">
            <span className="kicker">{t('recipe.source')}</span>
            <a className="spread-source-link" href={source.href} target="_blank" rel="noopener noreferrer">
              {source.text}
              <span className="visually-hidden"> {t('recipe.newTab')}</span>
            </a>
          </p>
        ) : null}
      </section>
    </>
  )
}

/** A numbered section head of the spread: "i Ingredients". */
function SectionHead({ id, n, title }: { id: string; n: number; title: string }) {
  return (
    <div className="spread-sec-head">
      <span className="spread-sec-no" aria-hidden="true">
        {sectionNumeral(n)}
      </span>
      <h2 className="spread-sec-title" id={id}>
        {title}
      </h2>
    </div>
  )
}
