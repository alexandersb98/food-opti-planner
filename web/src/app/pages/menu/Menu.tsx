import { useMemo, useSyncExternalStore } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import { api } from '../../../api/client'
import type { PlanResult } from '../../../api/types'
import { localDate } from '../../../dates'
import { useLoad } from '../../hooks/useLoad'
import { useT } from '../../i18n/i18n'
import * as solve from '../../stores/solve'
import { buttonClass } from '../../ui/button/Button'
import { LoadState } from '../../ui/loadState/LoadState'
import { isComposed } from './composed'
import { EditorsNote } from './EditorsNote'
import { MenuCard } from './MenuCard'
import { MenuColophon } from './MenuColophon'
import { dayOf, longRange, queryIndex, startWeek } from './menuText'
import './menu.css'

/** The plan /plans/new shows (the unsaved one, or none: null) or the saved
 * plan `id`; no data when it can't be had. */
async function loadPlan(id: string | undefined, signal: AbortSignal): Promise<{ data?: { plan: PlanResult | null } }> {
  let planId: number
  if (id === undefined) {
    const { data } = await api.GET('/api/plan-results', { signal })
    if (!data) return {}
    if (!data.unsaved) return { data: { plan: null } }
    planId = data.unsaved.id
  } else if (/^\d+$/.test(id)) planId = Number(id)
  else return {}
  const { data } = await api.GET('/api/plan-results/{plan_id}', { params: { path: { plan_id: planId } }, signal })
  return data ? { data: { plan: data } } : {}
}

const lastSolveClashed = () => solve.getSnapshot().failure === 'infeasible'

/**
 * The Menu (R1): the unsaved plan (/plans/new) or a saved one (/plans/:id)
 * as a menu card, every day on one page. `?day=` focuses that day and
 * `?meal=` opens that meal; otherwise the page opens at today when the plan
 * covers it. /plans/new shows the Editor's note after a clash, and a blank
 * card when there is no unsaved plan.
 */
export function Menu() {
  const t = useT()
  const { id } = useParams()
  const location = useLocation()
  const [search] = useSearchParams()
  const clash = useSyncExternalStore(solve.subscribe, lastSolveClashed) && id === undefined
  const page = useLoad((signal) => loadPlan(id, signal), id ?? 'new')
  // The dish links: never waited for, and the menu reads without them.
  const recipes = useLoad((signal) => api.GET('/api/recipes', { signal }))
  const recipeIds = useMemo(() => new Map((recipes.data ?? []).map((recipe) => [recipe.name, recipe.id])), [recipes.data])

  // The Editor's note takes the menu's place after a clash.
  if (clash) return <EditorsNote />

  const plan = page.data?.plan
  if (!plan) {
    if (page.data) return <BlankCard />
    return (
      <div className="menu-page">
        <h1 className="visually-hidden">{t('shell.pages.menu.title')}</h1>
        <LoadState of={page} message={t('results.loadFailed')} />
      </div>
    )
  }

  const days = plan.meals.length
  const focusDay = queryIndex(search.get('day'), days)
  const today = dayOf(plan, localDate())
  const mealDay = focusDay ?? today ?? 0
  const openMeal = queryIndex(search.get('meal'), plan.meals[mealDay]?.length ?? 0)
  const composed = isComposed(location.state)

  return (
    <div className="menu-page">
      <p className="kicker menu-issue">{t('menu.issue', { week: startWeek(plan.start_date), range: longRange(plan.start_date, plan.days) })}</p>
      <MenuCard
        key={plan.id}
        plan={plan}
        recipeIds={recipeIds}
        today={today}
        focusDay={focusDay}
        openMeal={openMeal}
        composed={composed}
      />
      <MenuColophon key={`colophon-${plan.id}`} plan={plan} />
    </div>
  )
}

/** No unsaved plan and no clash: a blank card that points to the brief. */
function BlankCard() {
  const t = useT()
  return (
    <div className="menu-page">
      <article className="menu-card is-blank" aria-labelledby="menu-title">
        <div className="menu-card-inner">
          <p className="menu-ornament" aria-hidden="true">
            ❦
          </p>
          <h1 className="menu-title" id="menu-title">
            {t('shell.pages.menu.title')}
          </h1>
          <div className="menu-blank-lines" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <p className="menu-blank-text">{t('menu.blank')}</p>
          <Link className={buttonClass({ variant: 'primary' })} to="/">
            {t('menu.compose')}
          </Link>
        </div>
      </article>
    </div>
  )
}
