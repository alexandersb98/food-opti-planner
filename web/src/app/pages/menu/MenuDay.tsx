import { memo, useCallback, useId, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import type { PlanResult, ResultMeal } from '../../../api/types'
import { valueText } from '../../../format'
import { dayLine, type DayPart } from '../../../misses'
import { roundedText } from '../../../totals'
import { useT } from '../../i18n/i18n'
import type { Translate } from '../../../translator'
import { dayParts, portionText } from './menuText'

/** Scaled ingredient amounts are shown with at most this many decimals. */
const AMOUNT_DECIMALS = 2
/** Margin figures: the dish's first attributes, in attribute order. */
const MARGIN_ATTRIBUTES = 2

/** Every attribute's total for the day, in attribute order; a value missed
 * that day (by the server's per-day misses) reads "Protein 98 / 120 g". */
function allValues(plan: PlanResult, day: number, t: Translate): DayPart[] {
  return plan.attributes.map((attribute, i) => {
    const misses = plan.misses.filter((miss) => miss.day === day && plan.goals[miss.goal]?.attribute === i)
    if (misses.length === 0) return { text: valueText(attribute, plan.day_totals[day]?.[i] ?? '0'), missed: false }
    const worst = misses.reduce((a, b) => (Number(b.percent) > Number(a.percent) ? b : a))
    const named = { name: attribute.name, actual: worst.actual, bound: worst.bound, unit: attribute.unit }
    return { text: t('misses.dayValue', named).trim(), missed: true }
  })
}

/** One day of the menu (R1): its weekday and date, each meal as a course,
 * and the day's totals at its foot. */
export const MenuDay = memo(function MenuDay({
  plan,
  day,
  isToday,
  recipeIds,
  openMeal,
  onSection,
}: {
  plan: PlanResult
  day: number
  isToday: boolean
  /** Recipe ids by exact name, for the dish links. */
  recipeIds: ReadonlyMap<string, number>
  /** The meal to open when the day first shows (from `?meal=`). */
  openMeal: number | null
  /** Called with the day's section element (and null when it goes). */
  onSection: (day: number, section: HTMLElement | null) => void
}) {
  const t = useT()
  const id = useId()
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set(openMeal === null ? [] : [openMeal]))
  const [allTotals, setAllTotals] = useState(false)
  const sectionRef = useCallback((section: HTMLElement | null) => onSection(day, section), [onSection, day])
  const { weekday, day: date, month } = dayParts(plan.start_date, day)
  const line = dayLine(plan, day, t)
  const values = allTotals ? allValues(plan, day, t) : line
  const canExpand = plan.attributes.length > line.length

  function toggle(meal: number) {
    setOpen((before) => {
      const after = new Set(before)
      if (!after.delete(meal)) after.add(meal)
      return after
    })
  }

  return (
    <section ref={sectionRef} id={`day-${day}`} className="menu-day" style={{ '--i': day } as CSSProperties} aria-labelledby={`${id}-h`} tabIndex={-1}>
      <h2 className="menu-day-head" id={`${id}-h`}>
        <span className="menu-dname">{weekday}</span>{' '}
        {isToday ? <span className="menu-today">{t('menu.today')}</span> : null}{' '}
        <span className="menu-ddate">
          {date} <span className="sc">{month}</span>
        </span>
      </h2>
      <ul className="menu-courses">
        {plan.meals[day]?.map((meal, i) => (
          <Course
            key={i}
            plan={plan}
            meal={meal}
            recipeId={meal.recipe === null ? undefined : recipeIds.get(meal.recipe)}
            open={open.has(i)}
            onToggle={() => toggle(i)}
            detailId={`${id}-m${i}`}
          />
        ))}
      </ul>
      {plan.attributes.length > 0 ? (
        <div className="menu-day-foot">
          <ul className="menu-totals" id={`${id}-t`} aria-label={t('menu.dayTotals')}>
            {values.map((part, i) => (
              <li key={i} className={part.missed ? 'menu-miss' : undefined}>
                {part.text}
                {part.missed ? <span className="visually-hidden"> {t('menu.goalMissed')}</span> : null}
              </li>
            ))}
          </ul>
          {canExpand ? (
            <button
              type="button"
              className="menu-more"
              aria-expanded={allTotals}
              aria-controls={`${id}-t`}
              onClick={() => setAllTotals((all) => !all)}
            >
              {allTotals ? t('results.showFewer') : t('results.showAll', { n: plan.attributes.length })}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
})

/** A meal of the day: the recipe and its portion with the margin figures,
 * or "skipped". A planned meal opens its ingredients, scaled to the
 * portion, and its totals. */
function Course({
  plan,
  meal,
  recipeId,
  open,
  onToggle,
  detailId,
}: {
  plan: PlanResult
  meal: ResultMeal
  recipeId: number | undefined
  open: boolean
  onToggle: () => void
  detailId: string
}) {
  const t = useT()
  if (!meal.planned || meal.recipe === null) {
    return (
      <li className="menu-course is-skip">
        <span className="menu-meal">{meal.name}</span>
        <p className="menu-skip">{t('results.skipped')}</p>
      </li>
    )
  }
  const portion = meal.portion ?? '1'
  const count = Number(portion)
  const margins = plan.attributes.slice(0, MARGIN_ATTRIBUTES)
  return (
    <li className={`menu-course${margins.length ? '' : ' is-bare'}`}>
      <button type="button" className="menu-meal menu-meal-btn" aria-expanded={open} aria-controls={detailId} onClick={onToggle}>
        <span aria-hidden="true">{meal.name}</span>
        <span className="visually-hidden">{t('menu.mealIngredients', { meal: meal.name })}</span>
        <svg className="menu-caret" viewBox="0 0 10 6" width="10" height="6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>
      <p className="menu-dish">
        {recipeId === undefined ? (
          <span className="menu-dish-name">{meal.recipe}</span>
        ) : (
          <Link className="menu-dish-name is-link" to={`/recipes/${recipeId}`}>
            {meal.recipe}
          </Link>
        )}
        {count !== 1 ? (
          <>
            {' '}
            <span className="menu-portion" aria-hidden="true">
              × {portionText(portion)}
            </span>
            <span className="visually-hidden">, {t('menu.portions', { portion: roundedText(portion, 2) }, count)}</span>
          </>
        ) : null}
      </p>
      {margins.length ? (
        <p className="menu-margin">
          {margins.map((attribute, i) => (
            <span key={i} className="menu-fig">
              <span className="visually-hidden">{`${i > 0 ? ', ' : ''}${attribute.name} `}</span>
              <b>{meal.totals[i] ?? '0'}</b> {attribute.unit}
            </span>
          ))}
        </p>
      ) : null}
      <div id={detailId} className="menu-detail" hidden={!open}>
        {open ? (
          <>
            <p className="menu-detail-head">{t('menu.ingredientsFor', { portion: portionText(portion) }, count)}</p>
            <ul className="menu-items">
              {meal.items.map((item, i) => (
                <li key={i} className="menu-item">
                  <span className="menu-item-name">{item.ingredient}</span>{' '}
                  <span className="menu-item-amount">{`${roundedText(item.amount, AMOUNT_DECIMALS)} ${item.unit}`.trim()}</span>
                </li>
              ))}
            </ul>
            {plan.attributes.length ? (
              <ul className="menu-totals menu-meal-totals" aria-label={t('menu.mealTotals')}>
                {plan.attributes.map((attribute, i) => (
                  <li key={i}>{valueText(attribute, meal.totals[i] ?? '0')}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  )
}
