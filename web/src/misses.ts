import type { PlanResult, ResultMiss } from './api/types'
import { dayLabel } from './dates'
import { valueText } from './format'
import { roundedText } from './totals'

// What the results page shows of the goals a plan missed: the Summary's
// Missed goals rows and the day line's marked values (R1).

type Translate = (key: string, named: Record<string, unknown>, plural?: number) => string
type Side = ResultMiss['side']

/** A row of the Summary's Missed goals: what was missed and, below it, the
 * worst miss. */
export type MissRow = { title: string; worst: string }

/** One value of a day's line; `missed` when a goal was missed on it that day. */
export type DayPart = { text: string; missed: boolean }

/** The day line shows this many attributes when the plan has no goals. */
const LINE_ATTRIBUTES = 3

/** "−18%" below, "+18%" above: the percent shown whole. */
export function percentText(percent: string, side: Side): string {
  return `${side === 'below' ? '−' : '+'}${roundedText(percent, 0)}%`
}

/** One row per goal, side and kind (days or the whole plan), in goal order,
 * below before above, the whole plan before days. The worst miss is the
 * largest percent, the earliest day on a tie. */
export function missRows(plan: PlanResult, t: Translate): MissRow[] {
  const groups = new Map<string, { goal: number; side: Side; wholePlan: boolean; misses: ResultMiss[] }>()
  for (const miss of plan.misses) {
    const wholePlan = miss.day === null
    const key = `${miss.goal}:${miss.side}:${wholePlan}`
    const group = groups.get(key) ?? { goal: miss.goal, side: miss.side, wholePlan, misses: [] }
    group.misses.push(miss)
    groups.set(key, group)
  }
  const order = ({ goal, side, wholePlan }: { goal: number; side: Side; wholePlan: boolean }) =>
    goal * 4 + (side === 'below' ? 0 : 2) + (wholePlan ? 0 : 1)
  return [...groups.values()]
    .sort((a, b) => order(a) - order(b))
    .flatMap(({ goal: index, side, wholePlan, misses }) => {
      const goal = plan.goals[index]
      if (!goal) return []
      const worst = misses.reduce((a, b) => (Number(b.percent) > Number(a.percent) ? b : a))
      const unit = plan.attributes[goal.attribute]?.unit ?? ''
      const named = {
        actual: worst.actual,
        bound: worst.bound,
        unit: wholePlan && goal.applies_to === 'daily_average' ? `${unit}/day` : unit,
        percent: percentText(worst.percent, side),
        day: worst.day === null ? '' : dayLabel(plan.start_date, worst.day),
      }
      return [
        {
          title: wholePlan
            ? t(`misses.plan.${side}`, { goal: goal.name })
            : t(`misses.days.${side}`, { goal: goal.name, n: misses.length }, misses.length),
          worst: t(wholePlan ? 'misses.worstPlan' : 'misses.worstDay', named).trim(),
        },
      ]
    })
}

/** A day's line: the attributes that have a goal, in the attributes' order,
 * or the first three without goals. A value missed that day (a day goal or a
 * guard-rail) reads "Protein 98 / 120 g"; the larger percent when missed twice. */
export function dayLine(plan: PlanResult, day: number, t: Translate): DayPart[] {
  const withGoals = new Set(plan.goals.map((goal) => goal.attribute))
  const missed = new Map<number, ResultMiss>()
  for (const miss of plan.misses) {
    const attribute = plan.goals[miss.goal]?.attribute
    if (miss.day !== day || attribute === undefined) continue
    const before = missed.get(attribute)
    if (!before || Number(miss.percent) > Number(before.percent)) missed.set(attribute, miss)
  }
  return plan.attributes.flatMap((attribute, i): DayPart[] => {
    if (withGoals.size > 0 ? !withGoals.has(i) : i >= LINE_ATTRIBUTES) return []
    const miss = missed.get(i)
    if (miss) {
      const named = { name: attribute.name, actual: miss.actual, bound: miss.bound, unit: attribute.unit }
      return [{ text: t('misses.dayValue', named).trim(), missed: true }]
    }
    return [{ text: valueText(attribute, plan.day_totals[day]?.[i] ?? '0'), missed: false }]
  })
}
