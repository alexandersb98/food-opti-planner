import { useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../../../api/client'
import type { PlanResult } from '../../../api/types'
import { dateRange, localDate } from '../../../dates'
import { missRows } from '../../../misses'
import { useLoad } from '../../hooks/useLoad'
import { useT } from '../../i18n/i18n'
import { toast } from '../../shell/toast'
import { Button } from '../../ui/button/Button'
import { useConfirm } from '../../ui/confirm/Confirm'
import { dayOf, longRange, startWeek } from './menuText'
import './colophon.css'

/** The totals table shows this many attributes until "Show all". */
const SHOWN_COLLAPSED = 5

const amount = (value: string | undefined, unit: string) => `${value ?? ''} ${unit}`.trim()

/**
 * The Menu's colophon (R1): how the week turned out (the status, the
 * week's first attribute as a pull figure, the missed goals or "All goals
 * met") and the totals table, then the plan's actions. An unsaved plan is
 * saved or discarded, both returning to the brief; a saved plan is deleted
 * (back to the archive) or used for today when it covers today and isn't
 * already, which stays here. Failures show here.
 */
export function MenuColophon({ plan }: { plan: PlanResult }) {
  const t = useT()
  const navigate = useNavigate()
  const [confirm, confirmSheet] = useConfirm()
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const tableId = useId()

  const todayDate = localDate()
  const today = dayOf(plan, todayDate)
  // Which plan today's meals come from; only asked for a saved plan covering today.
  const used = useLoad(
    async (signal): Promise<{ data?: { id: number | null } }> => {
      if (!plan.saved || today === null) return { data: { id: null } }
      const { data, response } = await api.GET('/api/plan-results/today', { params: { query: { date: todayDate } }, signal })
      return response.ok ? { data: { id: data?.id ?? null } } : {}
    },
    `${plan.id}:${plan.saved}:${todayDate}`,
  )
  const usedToday = used.data?.id === plan.id
  const canUseForToday = plan.saved && today !== null && used.data !== undefined && !usedToday

  const misses = missRows(plan, t)
  const first = plan.attributes[0]
  const collapsible = plan.attributes.length > SHOWN_COLLAPSED
  const rows = collapsible && !expanded ? plan.attributes.slice(0, SHOWN_COLLAPSED) : plan.attributes
  const name = dateRange(plan.start_date, plan.days)

  /** Calls the server; true when it answered OK, else shows `failure`. */
  async function act(call: () => Promise<{ response: Response }>, failure: string) {
    setError('')
    setBusy(true)
    try {
      const { response } = await call()
      if (response.ok) return true
    } catch {
      // shown below
    } finally {
      setBusy(false)
    }
    setError(failure)
    return false
  }

  const path = { params: { path: { plan_id: plan.id } } }

  async function save() {
    if (!(await act(() => api.POST('/api/plan-results/{plan_id}/save', path), t('common.saveFailed')))) return
    toast(t('menu.savedToast'))
    await navigate('/', { replace: true })
  }

  async function discard() {
    const sure = await confirm({
      title: t('results.discardTitle'),
      message: t('menu.discardMessage', { issue: t('menu.issue', { week: startWeek(plan.start_date), range: longRange(plan.start_date, plan.days) }) }),
      confirmLabel: t('results.discard'),
      cancelLabel: t('menu.keepIt'),
      destructive: true,
    })
    if (!sure) return
    if (!(await act(() => api.DELETE('/api/plan-results/{plan_id}', path), t('common.deleteFailed')))) return
    toast(t('menu.discarded'))
    await navigate('/', { replace: true })
  }

  async function remove() {
    const sure = await confirm({
      title: t('common.deleteTitle', { name }),
      message: t('menu.deleteMessage'),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!sure) return
    if (!(await act(() => api.DELETE('/api/plan-results/{plan_id}', path), t('common.deleteFailed')))) return
    toast(t('menu.deleted'))
    await navigate('/plans', { replace: true })
  }

  async function useForToday() {
    if (!(await act(() => api.POST('/api/plan-results/{plan_id}/use-for-today', path), t('common.saveFailed')))) return
    used.setData({ id: plan.id })
    toast(t('menu.usedToast'))
  }

  const turnedOut = [
    t(`menu.turnedOut.${plan.status}`),
    plan.goals.length === 0 ? '' : misses.length > 0 ? t('menu.goalsMissed', { n: misses.length }, misses.length) : t('menu.goalsMet'),
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section className="colophon" aria-labelledby="colophon-title">
      <p className="kicker">{t('menu.colophon')}</p>
      <h2 className="colophon-title" id="colophon-title">
        {t('menu.colophonTitle')}
      </h2>
      <p className="lead-text dropcap colophon-standfirst">{turnedOut}</p>

      {first ? (
        <p className="colophon-pull">
          <span className="colophon-big">
            {plan.totals[0]}
            {first.unit ? <small>{first.unit}</small> : null}
          </span>
          {t('menu.pullFor', { name: first.name.toLocaleLowerCase('en'), average: amount(plan.averages[0], first.unit) })}
        </p>
      ) : null}

      {plan.goals.length > 0 ? (
        <ul className="colophon-verdicts" aria-label={misses.length > 0 ? t('results.missedGoals') : undefined}>
          {misses.length === 0 ? (
            <li className="is-ok">
              <span className="colophon-v" aria-hidden="true">
                ✓
              </span>
              <p>{t('results.allGoalsMet')}</p>
            </li>
          ) : (
            misses.map((miss) => (
              <li key={miss.title} className="is-missed">
                <span className="colophon-v" role="img" aria-label={t('menu.missed')}>
                  †
                </span>
                <p>
                  {miss.title}{' '}
                  <span className="colophon-sub">{miss.worst}</span>
                </p>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {plan.attributes.length > 0 ? (
        <>
          <table className="colophon-totals">
            <caption className="visually-hidden">{t('menu.totals')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('menu.forTheWeek')}</th>
                <th scope="col">{t('menu.total')}</th>
                <th scope="col">{t('menu.aDay')}</th>
              </tr>
            </thead>
            <tbody id={tableId}>
              {rows.map((attribute, i) => (
                <tr key={attribute.name}>
                  <th scope="row">{attribute.name}</th>
                  <td>{amount(plan.totals[i], attribute.unit)}</td>
                  <td>{amount(plan.averages[i], attribute.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {collapsible ? (
            <Button
              variant="text"
              className="colophon-more"
              aria-expanded={expanded}
              aria-controls={tableId}
              onClick={() => setExpanded((open) => !open)}
            >
              {expanded ? t('results.showFewer') : t('results.showAll', { n: plan.attributes.length })}
            </Button>
          ) : null}
        </>
      ) : null}

      <div className="colophon-actions">
        {plan.saved ? (
          <p className={`colophon-filed${usedToday ? ' is-used' : ''}`}>
            <span>{t('menu.filed', { week: startWeek(plan.start_date) })}</span>
            {usedToday ? <span>{t('menu.usedToday')}</span> : null}
          </p>
        ) : (
          <Button variant="primary" block disabled={busy} onClick={save}>
            {t('menu.save')}
          </Button>
        )}
        {error ? (
          <p className="colophon-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="colophon-row">
          {canUseForToday ? (
            <Button disabled={busy} onClick={useForToday}>
              {t('results.useForToday')}
            </Button>
          ) : null}
          {plan.saved ? (
            <Button variant="ghost" disabled={busy} onClick={remove}>
              {t('common.delete')}
            </Button>
          ) : (
            <Button variant="ghost" disabled={busy} onClick={discard}>
              {t('results.discard')}
            </Button>
          )}
        </div>
      </div>
      {confirmSheet}
    </section>
  )
}
