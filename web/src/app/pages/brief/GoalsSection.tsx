import { useId, useMemo, useState, useSyncExternalStore } from 'react'
import type { Attribute, Goal, Plan } from '../../../api/types'
import { clashingGoalIds, clashRows } from '../../../clash'
import { goalSentence, IMPORTANCE } from '../../../goals'
import { useT } from '../../i18n/i18n'
import * as solve from '../../stores/solve'
import { Button } from '../../ui/button/Button'
import { ImportanceDots } from '../../ui/importanceDots/ImportanceDots'
import { BriefSection } from './BriefSection'
import { richText } from './words'
import './goals-section.css'

/** Which goal sheet to open: a goal to change, or null to add one. */
export type GoalToOpen = { goal: Goal | null } | null

const lastClash = () => solve.getSnapshot().clash

/** A Prefer goal's importance below and above its range, when it has its own. */
function splitImportance(goal: Goal): [number, number] | null {
  if (goal.must || (goal.importance_below == null && goal.importance_above == null)) return null
  return [goal.importance_below ?? goal.importance, goal.importance_above ?? goal.importance]
}

/**
 * Section 2 of the brief (D2's goals as statements): each goal a sentence,
 * "Between 1 500 and 2 000 kcal energy, as a daily average", tagged Must or
 * Prefer with Prefer's importance as dots, its name when it has one, and
 * marked in red pencil when it is in the last solve's clash. Each goal and
 * "Add goal" open the goal sheet.
 */
export function GoalsSection({ plan, attributes }: { plan: Plan; attributes: Attribute[] }) {
  const t = useT()
  const hintId = useId()
  // Ticket 18 shows the goal sheet for the goal opened here.
  const [, openGoal] = useState<GoalToOpen>(null)
  const clash = useSyncExternalStore(solve.subscribe, lastClash)
  const clashing = useMemo(() => new Set(clash ? clashingGoalIds(clashRows(clash, plan)) : []), [clash, plan])
  const noAttributes = attributes.length === 0

  const add = (
    <Button
      variant="text"
      className="goals-add"
      disabled={noAttributes}
      aria-describedby={noAttributes ? hintId : undefined}
      onClick={() => openGoal({ goal: null })}
    >
      {t('goals.section.add')}
    </Button>
  )

  return (
    <BriefSection section="goals" action={add}>
      {noAttributes ? (
        <p id={hintId} className="goals-hint">
          {t('goals.addAttributeFirst')}
        </p>
      ) : null}
      {plan.goals.length ? (
        <ul className="goals-list">
          {plan.goals.map((goal) => (
            <li key={goal.id}>
              <GoalStatement
                goal={goal}
                attribute={attributes.find(({ id }) => id === goal.attribute_id)}
                inClash={clashing.has(goal.id)}
                onOpen={() => openGoal({ goal })}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="goals-empty">{t('goals.section.empty')}</p>
      )}
      <p className="brief-section-intro">
        {richText(t, 'goals.section.intro', {
          must: <b>{t('goals.must')}</b>,
          prefer: <em>{t('goals.prefer')}</em>,
        })}
      </p>
    </BriefSection>
  )
}

/** One goal: its tag (Must, or Prefer with importance), its name, and the
 * sentence; a button that opens the goal sheet. */
function GoalStatement({
  goal,
  attribute,
  inClash,
  onOpen,
}: {
  goal: Goal
  attribute: Attribute | undefined
  inClash: boolean
  onOpen: () => void
}) {
  const t = useT()
  const sentence = goalSentence({ min: goal.min ?? null, max: goal.max ?? null, applies_to: goal.applies_to }, attribute, t)
  const split = splitImportance(goal)
  const className = ['goals-goal', goal.must ? 'goals-must' : 'goals-prefer', inClash ? 'goals-clash' : '']
    .filter(Boolean)
    .join(' ')
  return (
    <button type="button" className={className} onClick={onOpen}>
      {/* spaces between the parts, for the name screen readers read out */}
      {inClash ? <span className="visually-hidden">{t('goals.section.inClash')}</span> : null}{' '}
      <span className="goals-tag">
        <span className="goals-strict">{t(goal.must ? 'goals.must' : 'goals.prefer')}</span>{' '}
        {goal.must ? null : split ? (
          <span
            className="goals-split"
            role="img"
            aria-label={t('goals.importanceSplit', { below: split[0], above: split[1], max: IMPORTANCE.max })}
          >
            <ImportanceDots value={split[0]} max={IMPORTANCE.max} />
            <span className="goals-split-bar">/</span>
            <ImportanceDots value={split[1]} max={IMPORTANCE.max} />
          </span>
        ) : (
          <ImportanceDots value={goal.importance} max={IMPORTANCE.max} />
        )}{' '}
        {goal.custom_name ? <span className="goals-name">{goal.custom_name}</span> : null}{' '}
        <span className="goals-edit" aria-hidden="true">
          {t('goals.section.edit')}
        </span>
      </span>{' '}
      <span className="goals-text">
        {richText(t, sentence.key, {
          ...sentence.named,
          amount: <b>{sentence.named.amount}</b>,
          attribute: <span className="goals-attr">{sentence.named.attribute}</span>,
        })}
        .
      </span>
    </button>
  )
}
