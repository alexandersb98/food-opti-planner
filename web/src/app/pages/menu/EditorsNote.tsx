import { useState, useSyncExternalStore } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../../../api/client'
import type { Attribute, Goal, Plan } from '../../../api/types'
import {
  clashDrafts,
  clashErrors,
  clashFields,
  clashingGoalIds,
  clashRows,
  clashServerErrors,
  rowsKey,
  type ClashMarks,
  type ClashRow,
  type GoalRow,
} from '../../../clash'
import { dayLabel } from '../../../dates'
import type { GoalDraft } from '../../../goalDraft'
import { showsReference } from '../../../goalDraft'
import { loadAll } from '../../../load'
import { useLoad } from '../../hooks/useLoad'
import { useT } from '../../i18n/i18n'
import * as planSetup from '../../stores/planSetup'
import * as solve from '../../stores/solve'
import { Button, buttonClass } from '../../ui/button/Button'
import { Field } from '../../ui/field/Field'
import { LoadState } from '../../ui/loadState/LoadState'
import { useCompose } from '../brief/Composing'
import { longRange, startWeek } from './menuText'
import './editors-note.css'

type T = ReturnType<typeof useT>

/** Loads the setup into the plan-setup store, answering as a load call. */
async function loadSetup(): Promise<{ data?: true }> {
  await planSetup.load()
  const { plan, failed } = planSetup.getSnapshot()
  return plan && !failed ? { data: true } : {}
}

/** The setup with the note's changes to the clashing goals (as `clashFields`
 * builds them), or as it is when the note changed nothing. */
function withDrafts(plan: Plan, drafts: Record<number, GoalDraft>): Plan {
  const fields = clashFields(plan, drafts)
  if (!fields) return plan
  return {
    ...plan,
    goals: plan.goals.map((goal, index) => {
      const sent = fields.goals[index]!
      return { ...goal, ...sent, id: goal.id, min: text(sent.min), max: text(sent.max), zero_reference: text(sent.zero_reference) }
    }),
  }
}

/** A number as the setup holds it: text. */
const text = (value: string | number | null | undefined) => (value == null ? null : String(value))

function where(t: T, dates: string[]): string {
  return dates.length === 0
    ? t('clash.wholePlan')
    : t('clash.onDays', { days: dates.map((date) => dayLabel(date, 0)).join(', ') })
}

const solveClash = () => solve.getSnapshot().clash
const solveMinimal = () => solve.getSnapshot().clashMinimal

/**
 * The Editor's note on /plans/new after a solve found no plan possible (A5,
 * D2's "No plan possible"): the rules that clash, each clashing Must goal
 * with its bounds to loosen and Make Prefer, each day whose meals take part
 * with Change the schedule. Try again saves the note's changes, if any, then
 * goes back to the brief and composes the week again; Dismiss closes it.
 */
export function EditorsNote() {
  const t = useT()
  const page = useLoad(() => loadAll({ plan: loadSetup(), attributes: api.GET('/api/attributes') }))
  const setup = useSyncExternalStore(planSetup.subscribe, planSetup.getSnapshot).plan
  const clash = useSyncExternalStore(solve.subscribe, solveClash)
  const minimal = useSyncExternalStore(solve.subscribe, solveMinimal)
  const navigate = useNavigate()
  const compose = useCompose()

  // Here, not in the note: a save that changes a clashing goal starts the
  // note over (its key), and the retry must still run.
  function retry() {
    // Back to the brief, where the composing view shows while it solves.
    void navigate('/')
    void compose()
  }

  if (!page.data || !setup) {
    return (
      <div className="menu-page">
        <h1 className="visually-hidden">{t('clash.title')}</h1>
        <LoadState of={page} message={t('plan.loadFailed')} />
      </div>
    )
  }

  const rows = clashRows(clash ?? [], setup)
  return (
    <div className="menu-page">
      <p className="kicker menu-issue">
        {t('menu.issue', { week: startWeek(setup.start_date), range: longRange(setup.start_date, setup.days) })}
      </p>
      {/* Starts over from the goals as stored when the clash, or a goal it
          shows, changes; another save of the setup keeps what was typed. */}
      <Note
        key={`${JSON.stringify(clash)}|${rowsKey(rows)}`}
        setup={setup}
        attributes={page.data.attributes}
        rows={rows}
        minimal={minimal}
        onRetry={retry}
      />
    </div>
  )
}

function Note({
  setup,
  attributes,
  rows,
  minimal,
  onRetry,
}: {
  setup: Plan
  attributes: Attribute[]
  rows: ClashRow[]
  minimal: boolean
  onRetry: () => void
}) {
  const t = useT()
  const [drafts, setDrafts] = useState(() => clashDrafts(rows))
  const [errors, setErrors] = useState<Record<number, ClashMarks>>({})
  const [saveFailed, setSaveFailed] = useState(false)
  const [saving, setSaving] = useState(false)

  function edit(id: number, change: Partial<GoalDraft>) {
    setDrafts((drafts) => ({ ...drafts, [id]: { ...drafts[id]!, ...change } }))
  }

  async function tryAgain() {
    setSaveFailed(false)
    const found = clashErrors(setup.goals, drafts, t)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    if (clashFields(setup, drafts)) {
      setSaving(true)
      const saved = await planSetup.change((plan) => withDrafts(plan, drafts), { optimistic: false })
      if (!saved.plan) {
        const marks = clashServerErrors(saved.errors, setup, attributes, clashingGoalIds(rows), t)
        setErrors(marks)
        setSaveFailed(Object.keys(marks).length === 0)
        setSaving(false)
        return
      }
    }
    onRetry()
  }

  function dismiss() {
    solve.dismiss()
    // The note's buttons go with it: give focus to the page that replaces it.
    document.getElementById('page')?.focus({ preventScroll: true })
  }

  return (
    <article className="enote" aria-labelledby="enote-title">
      <div className="enote-card">
        <p className="kicker enote-kicker">{t('clash.note.kicker')}</p>
        <h1 className="enote-title" id="enote-title">
          {t('clash.title')}
        </h1>
        <p className="enote-lede dropcap">
          {rows.length === 0
            ? t('plan.failure.infeasible')
            : `${t('clash.note.lede')} ${minimal ? t('clash.more') : t('clash.notMinimal')}`}
        </p>
      </div>
      {rows.length > 0 ? (
        <ol className="enote-list" aria-label={t('clash.note.rules')}>
          {rows.map((row) =>
            row.kind === 'goal' ? (
              <GoalItem
                key={`goal-${row.goal.id}`}
                row={row}
                draft={drafts[row.goal.id]!}
                errors={errors[row.goal.id]}
                unit={unitOf(row.goal, attributes)}
                onEdit={(change) => edit(row.goal.id, change)}
              />
            ) : (
              <li key={`day-${row.day}`} className="enote-item">
                <p className="enote-where">{where(t, [row.date])}</p>
                <p className="enote-rule">{t('clash.meals', { day: dayLabel(row.date, 0) })}</p>
                <p className="enote-detail">
                  {row.atLeast === null ? t('clash.allPlanned') : t('clash.atLeast', row.atLeast)}
                </p>
                <Link className={buttonClass({ variant: 'text' }, 'enote-action')} to="/?sheet=schedule">
                  {t('clash.note.changeSchedule')}
                </Link>
              </li>
            ),
          )}
        </ol>
      ) : null}
      {saveFailed ? (
        <p className="enote-failed" role="alert">
          {t('common.saveFailed')}
        </p>
      ) : null}
      <p className="enote-signature">{t('clash.note.signature')}</p>
      <div className="enote-actions">
        <Button variant="primary" block onClick={() => void tryAgain()} disabled={saving} aria-busy={saving || undefined}>
          {saving ? t('clash.note.saving') : t('clash.tryAgain')}
        </Button>
        <Button variant="text" onClick={dismiss}>
          {t('plan.dismiss')}
        </Button>
      </div>
    </article>
  )
}

function unitOf(goal: Goal, attributes: Attribute[]): string {
  return attributes.find(({ id }) => id === goal.attribute_id)?.unit ?? ''
}

/** A clashing Must goal: where it clashes, its bounds (and zero reference
 * when it needs one) to loosen, and Make Prefer / Keep Must. */
function GoalItem({
  row,
  draft,
  errors,
  unit,
  onEdit,
}: {
  row: GoalRow
  draft: GoalDraft
  errors: ClashMarks | undefined
  unit: string
  onEdit: (change: Partial<GoalDraft>) => void
}) {
  const t = useT()
  const { goal } = row
  return (
    <li className={draft.must ? 'enote-item' : 'enote-item is-prefer'}>
      <p className="enote-where">{where(t, row.dates)}</p>
      <p className="enote-rule">
        {goal.name}
        <span className="enote-strictness">{draft.must ? t('goals.must') : t('clash.willBePrefer')}</span>
      </p>
      <div className="enote-bounds">
        {goal.min != null ? (
          <Bound label={t('goals.editor.min')} unit={unit} value={draft.min} error={errors?.min} onChange={(min) => onEdit({ min })} />
        ) : null}
        {goal.max != null ? (
          <Bound label={t('goals.editor.max')} unit={unit} value={draft.max} error={errors?.max} onChange={(max) => onEdit({ max })} />
        ) : null}
        {showsReference(draft) ? (
          <Bound
            wide
            label={t('goals.editor.zeroReference')}
            unit={unit}
            value={draft.zero_reference}
            error={errors?.reference}
            onChange={(zero_reference) => onEdit({ zero_reference })}
          />
        ) : null}
      </div>
      <Button
        small
        variant={draft.must ? 'outline' : 'ghost'}
        className="enote-action"
        onClick={() => onEdit({ must: !draft.must })}
      >
        {draft.must ? t('clash.makePrefer') : t('clash.keepMust')}
      </Button>
    </li>
  )
}

function Bound({
  label,
  unit,
  value,
  error,
  wide = false,
  onChange,
}: {
  label: string
  unit: string
  value: string
  error: string | undefined
  wide?: boolean
  onChange: (value: string) => void
}) {
  return (
    <Field label={label} error={error || undefined} className={wide ? 'enote-bound is-wide' : 'enote-bound'}>
      {(control) => (
        <span className="enote-input">
          <input
            {...control}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
          />
          {unit ? <span className="enote-unit">{unit}</span> : null}
        </span>
      )}
    </Field>
  )
}
