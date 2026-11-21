import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlanResult } from '../../../api/types'
import { useT } from '../../i18n/i18n'
import { MenuDay } from './MenuDay'
import { longRange } from './menuText'

/** Where today's day is against the screen, for the Today jump. */
type TodayAt = 'above' | 'here' | 'below'

/** Plans whose just-composed reveal has run (once per new plan). */
const revealed = new Set<number>()

function reducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * The menu card (R1): ornament, "The Menu", the dates, the count of days and
 * dishes, saved or not and the status stamp, then every day in order on one
 * page. Opens at `focusDay` (focused, from `?day=`) or else scrolled to
 * today; `openMeal` opens that meal of the day it opens at. A "Today" jump
 * shows while the plan covers today and today is out of sight. Mounted once
 * per plan (keyed by its id).
 */
export function MenuCard({
  plan,
  recipeIds,
  today,
  focusDay,
  openMeal,
  composed,
}: {
  plan: PlanResult
  recipeIds: ReadonlyMap<string, number>
  /** Today's day in the plan, or null when it doesn't cover today. */
  today: number | null
  focusDay: number | null
  openMeal: number | null
  /** Just composed: set the days one after another and land the stamp. */
  composed: boolean
}) {
  const t = useT()
  // decided once, when the card first shows
  const [start] = useState(() => {
    const day = focusDay ?? today ?? 0
    return {
      day,
      reveal: composed && !revealed.has(plan.id) && !reducedMotion(),
      todayAt: (today === null || today === day ? 'here' : today < day ? 'above' : 'below') as TodayAt,
    }
  })
  const [todayAt, setTodayAt] = useState<TodayAt>(start.todayAt)
  const days = useRef<Array<HTMLElement | null>>([])
  const onSection = useCallback((day: number, section: HTMLElement | null) => {
    days.current[day] = section
  }, [])

  useEffect(() => {
    if (composed) revealed.add(plan.id)
  }, [composed, plan.id])

  // Land where asked: `?day=` is focused (and so scrolled to); otherwise
  // today, when it isn't the first day, is scrolled to.
  useEffect(() => {
    const section = days.current[start.day]
    if (focusDay !== null) section?.focus()
    else if (today !== null && today > 0) section?.scrollIntoView?.({ block: 'start' })
    // only when the card first shows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start])

  // Keep track of whether today is in sight.
  useEffect(() => {
    const section = today === null ? null : days.current[today]
    if (!section || typeof IntersectionObserver !== 'function') return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        setTodayAt(entry.isIntersecting ? 'here' : entry.boundingClientRect.top < 0 ? 'above' : 'below')
      },
      { rootMargin: '-60px 0px 0px 0px' },
    )
    observer.observe(section)
    return () => observer.disconnect()
  }, [today])

  function goToToday() {
    if (today === null) return
    const section = days.current[today]
    section?.focus({ preventScroll: true })
    section?.scrollIntoView?.({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' })
    setTodayAt('here')
  }

  const dishes = plan.meals.reduce((sum, meals) => sum + meals.filter((meal) => meal.planned).length, 0)
  const first = plan.attributes[0]?.name.toLocaleLowerCase('en')
  const second = plan.attributes[1]?.name.toLocaleLowerCase('en')
  const anyDayMiss = plan.misses.some((miss) => miss.day !== null)

  return (
    <article className={`menu-card${start.reveal ? ' is-reveal' : ''}`} aria-labelledby="menu-title">
      <p className={`menu-stamp${plan.status === 'optimal' ? '' : ' is-warn'}`}>
        <span aria-hidden="true">{t(`plan.statusShort.${plan.status}`)}</span>
        <span className="visually-hidden">{t('menu.status', { status: t(`results.status.${plan.status}`) })}</span>
      </p>
      <div className="menu-card-inner">
        <header className="menu-head">
          <p className="menu-ornament" aria-hidden="true">
            ❦
          </p>
          <h1 className="menu-title" id="menu-title">
            {t('shell.pages.menu.title')}
          </h1>
          <p className="menu-sub">{t('menu.for', { range: longRange(plan.start_date, plan.days) })}</p>
          <p className="menu-count">
            {t('menu.count', { days: t('menu.days', { n: plan.days }), dishes: t('menu.dishes', { n: dishes }) })}
          </p>
          <p className={`menu-saved${plan.saved ? ' is-saved' : ''}`}>{t(plan.saved ? 'menu.saved' : 'menu.unsaved')}</p>
        </header>
        {plan.meals.map((_, day) => (
          <MenuDay
            key={day}
            plan={plan}
            day={day}
            isToday={day === today}
            recipeIds={recipeIds}
            openMeal={day === start.day ? openMeal : null}
            onSection={onSection}
          />
        ))}
        {today !== null && todayAt !== 'here' ? (
          <div className="menu-jump">
            <button type="button" className="menu-jump-btn" onClick={goToToday}>
              <span aria-hidden="true" className="menu-jump-arrow">
                {todayAt === 'above' ? '↑' : '↓'}
              </span>
              {t('menu.todayJump')}
            </button>
          </div>
        ) : null}
        <footer className="menu-end">
          <p className="menu-ornament" aria-hidden="true">
            ❦
          </p>
          {first ? (
            <p className="menu-key">
              {second ? t('menu.keyTwo', { first, second }) : t('menu.keyOne', { first })}
              {anyDayMiss ? (
                <>
                  {' '}
                  <span className="menu-dag" aria-hidden="true">
                    †
                  </span>{' '}
                  <span aria-hidden="true">{t('menu.keyMissed')}</span>
                </>
              ) : null}
            </p>
          ) : null}
        </footer>
      </div>
    </article>
  )
}
