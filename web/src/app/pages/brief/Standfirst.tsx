import type { Plan } from '../../../api/types'
import { useLocale, useT } from '../../i18n/i18n'
import { capitalised, numberWord, richText } from './words'

/** How many meals the setup asks the planner to fill: every day's meals
 * but the skipped ones. */
export function mealsToPlan(plan: Plan): number {
  const skipped = new Set(
    plan.skips.filter(({ day, meal }) => day < plan.days && meal < plan.meals.length).map(({ day, meal }) => `${day}:${meal}`),
  )
  return plan.days * plan.meals.length - skipped.size
}

/**
 * The cover's standfirst: the whole setup in three sentences, numbers in
 * words. "Five days, three meals a day: 15 to plan. Four goals, two of them
 * Must. Six recipes in play." The last one waits for the server's count.
 */
export function Standfirst({ plan, usable }: { plan: Plan; usable: number | null }) {
  const t = useT()
  const { locale } = useLocale()
  const word = (n: number) => numberWord(t, n)
  const sentence = (text: string) => capitalised(text, locale.code)

  const toPlan = mealsToPlan(plan)
  const [first, ...rest] = richText(t, 'brief.standfirst.schedule', {
    days: t('brief.standfirst.days', { word: word(plan.days) }, plan.days),
    meals: t('brief.standfirst.meals', { word: word(plan.meals.length) }, plan.meals.length),
    toPlan: <b>{t('brief.standfirst.toPlan', toPlan)}</b>,
  })

  const goals = plan.goals.length
  const must = plan.goals.filter((goal) => goal.must).length
  const goalsText =
    goals === 0
      ? t('brief.standfirst.noGoals')
      : goals === 1
        ? t(must ? 'brief.standfirst.oneGoalMust' : 'brief.standfirst.oneGoalPrefer')
        : t('brief.standfirst.goals', {
            goals: t('brief.standfirst.goalCount', { word: word(goals) }),
            must: t('brief.standfirst.must', { word: word(must) }, must),
          })

  return (
    <p className="standfirst brief-standfirst dropcap">
      {typeof first === 'string' ? sentence(first) : first}
      {rest} {sentence(goalsText)}
      {usable === null ? null : <> {sentence(t('brief.standfirst.recipes', { word: word(usable) }, usable))}</>}
    </p>
  )
}
