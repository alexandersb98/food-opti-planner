import type { Attribute, ClashMember, Goal, Plan, PlanFields } from './api/types'
import { draftErrors, draftFields, draftFromGoal, serverErrors, type GoalDraft, type GoalErrors } from './composables/useGoalDraft'
import type { Translate } from './goals'
import { goalFields, planFields } from './plan'

// The No plan possible card (A5): the clash the server answered, as rows for
// the plan as it is now, and the card's changes to the clashing goals. Each
// goal's draft is the goal editor's (`useGoalDraft`), changed only in its
// bounds, Must and reference, so the card checks and sends a goal as the
// editor does.

/** A clashing Must goal, with the dates it clashes on (none for the whole plan). */
export type GoalRow = { kind: 'goal'; goal: Goal; dates: string[] }
/** A day's meals that must be served: its "At least", or null for all planned. */
export type MealsRow = { kind: 'day_minimum'; day: number; date: string; atLeast: number | null }
export type ClashRow = GoalRow | MealsRow

/** The clash's rows, in its order: one per goal, still there and Must, with
 * its dates; one per day's meals, for a day the schedule still has. */
export function clashRows(clash: readonly ClashMember[], plan: Plan): ClashRow[] {
  const rows: ClashRow[] = []
  const goalRows = new Map<number, GoalRow>()
  for (const member of clash) {
    if (member.kind === 'day_minimum') {
      if (member.day == null || member.date == null || member.day >= plan.days) continue
      const minimum = plan.minimums.find(({ day }) => day === member.day)
      rows.push({ kind: 'day_minimum', day: member.day, date: member.date, atLeast: minimum?.at_least ?? null })
      continue
    }
    const goal = plan.goals.find(({ id }) => id === member.goal_id)
    if (!goal?.must) continue
    let row = goalRows.get(goal.id)
    if (!row) {
      row = { kind: 'goal', goal, dates: [] }
      goalRows.set(goal.id, row)
      rows.push(row)
    }
    if (member.date != null) row.dates.push(member.date)
  }
  return rows
}

/** The ids of the goals in the clash, for the Goals card. */
export function clashingGoalIds(clash: readonly ClashMember[] | null): number[] {
  return (clash ?? []).flatMap(({ goal_id }) => (goal_id == null ? [] : [goal_id]))
}

/** A draft per goal row, by goal id, as the goal is stored. */
export function clashDrafts(rows: ClashRow[]): Record<number, GoalDraft> {
  const drafts: Record<number, GoalDraft> = {}
  for (const row of rows) if (row.kind === 'goal') drafts[row.goal.id] = draftFromGoal(row.goal, [])
  return drafts
}

/** Whether the card changed the goal: its bounds, Must or reference. */
export function changed(goal: Goal, draft: GoalDraft): boolean {
  return (
    draft.min !== (goal.min ?? '') ||
    draft.max !== (goal.max ?? '') ||
    draft.must !== goal.must ||
    draft.zero_reference !== (goal.zero_reference ?? '')
  )
}

/** What is wrong with each changed goal as typed, by goal id; none when all
 * can be sent. */
export function clashErrors(
  goals: Goal[],
  drafts: Record<number, GoalDraft>,
  t: Translate,
): Record<number, Pick<GoalErrors, 'min' | 'max' | 'reference'>> {
  const found: Record<number, Pick<GoalErrors, 'min' | 'max' | 'reference'>> = {}
  for (const goal of goals) {
    const draft = drafts[goal.id]
    if (!draft || !changed(goal, draft)) continue
    const errors = draftErrors(draft, t)
    if (errors.min || errors.max || errors.reference) found[goal.id] = errors
  }
  return found
}

/** The setup to send with the card's changes, or null when it changed
 * nothing. Goals it did not change go back as loaded. */
export function clashFields(plan: Plan, drafts: Record<number, GoalDraft>): PlanFields | null {
  const edited = plan.goals.filter((goal) => drafts[goal.id] && changed(goal, drafts[goal.id]!))
  if (edited.length === 0) return null
  return {
    ...planFields(plan),
    goals: plan.goals.map((goal) =>
      edited.includes(goal) ? draftFields(drafts[goal.id]!, goal.id, goal.custom_name ?? null) : goalFields(goal),
    ),
  }
}

/** What the server refused, by goal id, for the goals the card shows, as the
 * goal editor marks it. A refusal with no field marked on these goals gives
 * an empty record. */
export function clashServerErrors(
  found: Partial<Record<string, string>>,
  plan: Plan,
  attributes: Attribute[],
  goalIds: number[],
  t: Translate,
): Record<number, GoalErrors> {
  const marked: Record<number, GoalErrors> = {}
  plan.goals.forEach((goal, index) => {
    if (!goalIds.includes(goal.id)) return
    const attribute = attributes.find(({ id }) => id === goal.attribute_id)
    const errors = serverErrors(found, index, attribute, t)
    if (!errors.save) marked[goal.id] = errors
  })
  return marked
}
