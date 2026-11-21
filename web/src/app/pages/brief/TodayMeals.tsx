import { Link } from 'react-router'
import type { TodayPlan } from '../../../api/types'
import { portionAmount, portionFigure } from '../../../portions'
import { useLocale, useT } from '../../i18n/i18n'

/** "Saturday 21 November": a "YYYY-MM-DD" date in words (UTC, so the
 * browser's time zone can't move the day). */
function longDate(date: string, locale: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const at = new Date(Date.UTC(year!, month! - 1, day!))
  const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(at)
  return `${part({ weekday: 'long' })} ${day} ${part({ month: 'long' })}`
}

/**
 * Today's meals from the plan used for today, set like a day of The Menu:
 * each meal's name, then its dish and portion. A meal opens that plan at
 * today with the meal open; a skipped one opens it at today.
 */
export function TodayMeals({ today }: { today: TodayPlan }) {
  const t = useT()
  const { locale } = useLocale()
  return (
    <section className="brief-today" aria-labelledby="brief-today-title">
      <div className="brief-today-head">
        <h2 className="brief-today-title" id="brief-today-title">
          {t('brief.today.title')}
        </h2>
        <p className="brief-today-date">{longDate(today.date, locale.code)}</p>
      </div>
      <ul className="brief-today-meals">
        {today.meals.map((meal, index) => {
          const search = meal.planned ? `?day=${today.day}&meal=${index}` : `?day=${today.day}`
          const portion = portionAmount(meal.portion ?? '1')
          return (
            <li key={index}>
              <Link className="brief-today-meal" to={`/plans/${today.id}${search}`}>
                <span className="brief-today-name">
                  {meal.name}
                  <span className="visually-hidden">: </span>
                </span>
                {meal.planned ? (
                  <span className="brief-today-dish">
                    <span className="brief-today-recipe">{meal.recipe}</span>
                    {portion === 1 ? null : (
                      <>
                        <span className="brief-today-portion" aria-hidden="true">
                          × {portionFigure(portion)}
                        </span>
                        <span className="visually-hidden">, {t('brief.today.portions', { n: portion }, portion)}</span>
                      </>
                    )}
                  </span>
                ) : (
                  <span className="brief-today-skipped">{t('brief.today.skipped')}</span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
