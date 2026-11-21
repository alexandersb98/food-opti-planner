import { useEffect, useSyncExternalStore, type MouseEvent } from 'react'
import { api } from '../../../api/client'
import type { Plan, TagFilter } from '../../../api/types'
import { localDate } from '../../../dates'
import { loadAll } from '../../../load'
import { useLoad } from '../../hooks/useLoad'
import { useRecipeCount } from '../../hooks/useRecipeCount'
import { useLocale, useT } from '../../i18n/i18n'
import { isoWeek } from '../../shell/Contents'
import * as planSetup from '../../stores/planSetup'
import * as solve from '../../stores/solve'
import { LoadState } from '../../ui/loadState/LoadState'
import { briefSections, headingId } from './BriefSection'
import { Compose } from './Compose'
import { Composing, useCompose } from './Composing'
import { FiltersSection } from './FiltersSection'
import { GoalsSection } from './GoalsSection'
import { NewPlanLine } from './NewPlanLine'
import { ScheduleSection } from './ScheduleSection'
import { mealsToPlan, Standfirst } from './Standfirst'
import { TimeSection } from './TimeSection'
import { TodayMeals } from './TodayMeals'
import { richText } from './words'
import './brief.css'

/** Loads the setup into the plan-setup store, answering as a load call:
 * no data when it failed. */
async function loadSetup(): Promise<{ data?: true }> {
  await planSetup.load()
  const { plan, failed } = planSetup.getSnapshot()
  return plan && !failed ? { data: true } : {}
}

const isSolving = () => solve.getSnapshot().running

/** "Week 39, 21–27 September": the plan's ISO week and its dates. */
export function issueLine(t: ReturnType<typeof useT>, plan: Plan, locale: string): string {
  const [year, month, day] = plan.start_date.split('-').map(Number)
  const first = new Date(Date.UTC(year!, month! - 1, day!))
  const last = new Date(Date.UTC(year!, month! - 1, day! + plan.days - 1))
  const monthName = (date: Date, style: 'long' | 'short') =>
    new Intl.DateTimeFormat(locale, { month: style, timeZone: 'UTC' }).format(date)
  const range =
    plan.days <= 1
      ? t('brief.range.oneDay', { day: first.getUTCDate(), month: monthName(first, 'long') })
      : first.getUTCMonth() === last.getUTCMonth()
        ? t('brief.range.sameMonth', { from: first.getUTCDate(), to: last.getUTCDate(), month: monthName(first, 'long') })
        : t('brief.range.across', {
            from: first.getUTCDate(),
            fromMonth: monthName(first, 'short'),
            to: last.getUTCDate(),
            toMonth: monthName(last, 'short'),
          })
  return t('brief.issue', { week: isoWeek(new Date(year!, month! - 1, day!)), range })
}

/** "In this brief": scroll to the section and move focus to its heading. */
function jumpTo(event: MouseEvent<HTMLAnchorElement>, sectionId: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  document.getElementById(sectionId)?.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  document.getElementById(headingId(sectionId))?.focus({ preventScroll: true })
}

/**
 * This week's brief, the start page (D2's `#plan`): the cover with the
 * week, the standfirst and "In this brief"; the unsaved plan and today's
 * meals; the four numbered sections; and "Compose the week". The setup
 * lives in the plan-setup store, so every section saves in place.
 */
export function Brief() {
  const t = useT()
  const { locale } = useLocale()
  const page = useLoad(() =>
    loadAll({
      plan: loadSetup(),
      attributes: api.GET('/api/attributes'),
      tags: api.GET('/api/tags'),
      results: api.GET('/api/plan-results'),
      today: api.GET('/api/plan-results/today', { params: { query: { date: localDate() } } }),
    }),
  )
  const setup = useSyncExternalStore(planSetup.subscribe, planSetup.getSnapshot)
  const solving = useSyncExternalStore(solve.subscribe, isSolving)
  const compose = useCompose()
  const plan = page.data ? setup.plan : null

  // How many recipes the filters leave, as the server counts it.
  const recipes = useRecipeCount()
  const { ask } = recipes
  const filters = plan ? JSON.stringify(plan.tag_filters) : null
  useEffect(() => {
    if (filters !== null) void ask(JSON.parse(filters) as TagFilter[])
  }, [filters, ask])

  return (
    <article className="brief">
      <div className="brief-cover">
        <p className="kicker brief-kicker">{plan ? issueLine(t, plan, locale.code) : ' '}</p>
        <h1 className="brief-title display">{richText(t, 'brief.title', { brief: <em>{t('brief.titleWord')}</em> })}</h1>
        {plan ? (
          <>
            <Standfirst plan={plan} usable={recipes.count?.usable ?? null} />
            <nav aria-label={t('brief.inThisBrief')}>
              <ol className="brief-toc">
                {briefSections.map(({ id, title }, index) => (
                  <li key={id}>
                    <a href={`#${id}`} onClick={(event) => jumpTo(event, id)}>
                      <span className="brief-toc-no" aria-hidden="true">
                        {index + 1}
                      </span>
                      {t(title)}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </>
        ) : null}
      </div>

      {plan && page.data ? (
        <>
          {page.data.results.unsaved ? <NewPlanLine plan={page.data.results.unsaved} /> : null}
          {page.data.today ? <TodayMeals today={page.data.today} /> : null}
          <ScheduleSection plan={plan} />
          <GoalsSection plan={plan} attributes={page.data.attributes} />
          <FiltersSection plan={plan} tags={page.data.tags} count={recipes} />
          <TimeSection seconds={plan.solve_time_limit} />
        </>
      ) : (
        <LoadState of={page} message={t('brief.loadFailed')} />
      )}

      <Composing />
      <Compose meals={plan ? mealsToPlan(plan) : null} disabled={!plan || solving} onCompose={() => void compose()} />
    </article>
  )
}
