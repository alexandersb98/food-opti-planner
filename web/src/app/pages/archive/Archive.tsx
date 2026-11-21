import { Link } from 'react-router'
import { api } from '../../../api/client'
import type { PlanResultSummary } from '../../../api/types'
import { dateRange, isoWeek, localDate } from '../../../dates'
import { loadAll } from '../../../load'
import type { Translate } from '../../../translator'
import { useLoad } from '../../hooks/useLoad'
import { useT } from '../../i18n/i18n'
import { buttonClass } from '../../ui/button/Button'
import { LoadState } from '../../ui/loadState/LoadState'
import './archive.css'

// When a plan was saved, in the browser's (the owner's) time zone, in
// words like the rest of the app's dates: "Sun", "Sep" and "18:04".
const savedWeekday = new Intl.DateTimeFormat('en', { weekday: 'short' })
const savedMonth = new Intl.DateTimeFormat('en', { month: 'short' })
const savedTime = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** "7 days. Saved Sun 20 Sep, 18:04." */
function metaText(t: Translate, plan: PlanResultSummary): string {
  const days = t('archive.days', plan.days)
  if (plan.saved_at === null) return t('archive.metaUnsaved', { days })
  const at = new Date(plan.saved_at)
  return t('archive.meta', {
    days,
    weekday: savedWeekday.format(at),
    day: at.getDate(),
    month: savedMonth.format(at),
    time: savedTime.format(at),
  })
}

/** The ISO week a plan starting on `start` ("YYYY-MM-DD") begins in. */
function startWeek(start: string): number {
  const [year, month, day] = start.split('-').map(Number)
  return isoWeek(new Date(year!, month! - 1, day!))
}

/**
 * The archive: the saved plans, newest first as the server lists them. Each
 * entry has the ISO week its plan starts in as an ornament, the dates as its
 * title and when it was saved; the plan used for today is marked Today.
 * An entry opens the plan's menu. Empty, it says how plans get here.
 */
export function Archive() {
  const t = useT()
  const page = useLoad((signal) =>
    loadAll({
      results: api.GET('/api/plan-results', { signal }),
      today: api.GET('/api/plan-results/today', { params: { query: { date: localDate() } }, signal }),
    }),
  )

  return (
    <article className="archive">
      <div className="cover archive-cover">
        <p className="kicker">{t('archive.kicker')}</p>
        <h1 className="cover-title display archive-title">
          {t('archive.titleArticle')} <em>{t('archive.titleName')}</em>
        </h1>
        <p className="standfirst archive-standfirst">{t('archive.standfirst')}</p>
      </div>
      {page.data ? (
        <SavedPlans plans={page.data.results.saved} todayId={page.data.today?.id ?? null} />
      ) : (
        <LoadState of={page} message={t('archive.loadFailed')} />
      )}
    </article>
  )
}

function SavedPlans({ plans, todayId }: { plans: PlanResultSummary[]; todayId: number | null }) {
  const t = useT()
  if (plans.length === 0) {
    return (
      <div className="empty-state archive-empty">
        <p>{t('archive.empty')}</p>
        <Link className={buttonClass({ variant: 'text' })} to="/plans/new">
          {t('archive.toMenu')}
        </Link>
      </div>
    )
  }
  return (
    <ul className="archive-list" aria-label={t('archive.plans')}>
      {plans.map((plan) => (
        <li key={plan.id}>
          <SavedPlan plan={plan} today={plan.id === todayId} />
        </li>
      ))}
    </ul>
  )
}

function SavedPlan({ plan, today }: { plan: PlanResultSummary; today: boolean }) {
  const t = useT()
  return (
    <Link className="archive-entry" to={`/plans/${plan.id}`}>
      <span className="archive-week" aria-hidden="true">
        {startWeek(plan.start_date)}
      </span>
      <span className="archive-text">
        <span className="archive-dates">{dateRange(plan.start_date, plan.days)}</span>
        <span className="archive-meta">{metaText(t, plan)}</span>
      </span>
      {today ? (
        <span className="archive-today">{t('archive.today')}</span>
      ) : (
        <span className="archive-chevron" aria-hidden="true">
          ›
        </span>
      )}
    </Link>
  )
}
