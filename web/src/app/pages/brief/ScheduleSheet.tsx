import { useId, useRef, useState, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import type { Plan } from '../../../api/types'
import { planFields } from '../../../planFields'
import { DAYS, serverErrors, validDays } from '../../../scheduleDraft'
import { useLocale, useT } from '../../i18n/i18n'
import { toast } from '../../shell/toast'
import * as planSetup from '../../stores/planSetup'
import { buttonClass } from '../../ui/button/Button'
import { Field, Fieldset } from '../../ui/field/Field'
import { Sheet } from '../../ui/sheet/Sheet'
import { Stepper } from '../../ui/stepper/Stepper'
import { issueLine } from './Brief'
import { check, MEALS_MAX, useScheduleDraft } from './useScheduleDraft'
import { numberWord, richText } from './words'
import './schedule-sheet.css'

/**
 * The schedule sheet (D2's "The schedule"): the start date with the
 * device's date picker and the week it gives, the number of days on a
 * stepper, and the meal names, added, renamed, moved and removed (one is
 * always kept). Cancel, Escape or a tap outside throw the changes away;
 * Done checks them and saves the setup, staying open with what the server
 * refused on its field. Each opening starts from the saved setup.
 */
export function ScheduleSheet({
  open,
  onClose,
  plan,
  finalFocus,
}: {
  open: boolean
  onClose: () => void
  plan: Plan
  finalFocus?: RefObject<HTMLElement | null>
}) {
  const t = useT()
  // A fresh draft for each opening.
  const [round, setRound] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setRound(round + 1)
  }
  return (
    <Sheet open={open} onClose={onClose} title={t('brief.sections.schedule')} finalFocus={finalFocus}>
      <ScheduleForm key={round} plan={plan} onDone={onClose} />
    </Sheet>
  )
}

function ScheduleForm({ plan, onDone }: { plan: Plan; onDone: () => void }) {
  const t = useT()
  const { locale } = useLocale()
  const id = useId()
  const formRef = useRef<HTMLDivElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const [state, dispatch] = useScheduleDraft(plan)
  const [saving, setSaving] = useState(false)
  const { draft, errors } = state
  const { meals } = draft

  const days = validDays(draft.daysText) ?? plan.days
  const daysLabelId = `${id}-days`
  const mealInput = (key: number) => `${id}-meal-${key}`
  const mealError = (key: number) => `${id}-meal-${key}-error`
  const control = (key: number, what: 'up' | 'down') => `${id}-${what}-${key}`
  const focus = (elementId: string) => document.getElementById(elementId)?.focus()

  /** The meal's name for the buttons beside it, or "meal 2" while it has none. */
  const title = (index: number) => meals[index]!.name.trim() || t('schedule.mealN', { n: index + 1 })

  function add() {
    flushSync(() => dispatch({ type: 'add' }))
    focus(mealInput(state.nextKey))
  }

  function move(key: number, index: number, by: -1 | 1) {
    flushSync(() => dispatch({ type: 'move', key, by }))
    // Focus stays on the arrow pressed, or goes to the other one at an end.
    const to = index + by
    const atEnd = by < 0 ? to === 0 : to === meals.length - 1
    const pressed = by < 0 ? 'up' : 'down'
    const other = by < 0 ? 'down' : 'up'
    focus(control(key, atEnd ? other : pressed))
  }

  function remove(key: number) {
    dispatch({ type: 'remove', key })
    addRef.current?.focus()
  }

  async function done() {
    if (saving) return
    const checked = check(plan, state, t)
    if ('errors' in checked) {
      flushSync(() => dispatch({ type: 'errors', errors: checked.errors }))
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    if (JSON.stringify(checked.fields) === JSON.stringify(planFields(plan))) {
      onDone()
      return
    }
    setSaving(true)
    const saved = await planSetup.change(checked.next, { optimistic: false })
    setSaving(false)
    if (saved.plan) {
      toast(t('schedule.edit.changed'))
      onDone()
    } else dispatch({ type: 'errors', errors: serverErrors(saved.errors, meals, checked.fields, t) })
  }

  // The week as it would read on the cover, while the start typed is not a date yet too.
  const preview = richText(t, 'schedule.edit.preview', {
    range: <b>{issueLine(t, { ...plan, start_date: state.shownStart, days }, locale.code)}</b>,
    days: t('brief.standfirst.days', { word: numberWord(t, days) }, days),
    meals: t('brief.standfirst.meals', { word: numberWord(t, meals.length) }, meals.length),
  })
  // A minimum the server refused has no field here (the days' sheets have it).
  const saveError =
    errors.save || (Object.keys(errors.minimums).length ? t('schedule.abovePlanned') : '')

  return (
    <div ref={formRef} className="sched-edit">
      <p className="sheet-preview" aria-live="polite">
        {preview}
      </p>

      <Field className="sched-edit-field" label={t('schedule.edit.starts')} error={errors.start || undefined}>
        {(wiring) => (
          <input
            {...wiring}
            type="date"
            name="start"
            className="sched-edit-date"
            autoComplete="off"
            required
            value={draft.start}
            onChange={(event) => dispatch({ type: 'start', text: event.target.value })}
          />
        )}
      </Field>

      <div className="sched-edit-field sched-edit-days">
        <span className="field-label" id={daysLabelId}>
          {t('schedule.days')}
        </span>
        <Stepper
          value={days}
          min={DAYS.min}
          max={DAYS.max}
          labelledBy={daysLabelId}
          decreaseLabel={t('schedule.fewerDays')}
          increaseLabel={t('schedule.moreDays')}
          onChange={(next) => dispatch({ type: 'days', days: next })}
        />
        {errors.days ? (
          <p className="field-error" role="alert">
            {errors.days}
          </p>
        ) : null}
      </div>

      <Fieldset className="sched-edit-field" legend={t('schedule.meals')}>
        <ol className="sched-edit-meals">
          {meals.map((meal, index) => {
            const error = errors.meals[meal.key]
            return (
              <li key={meal.key} className="sched-edit-meal">
                <div className="sched-edit-meal-row">
                  <input
                    id={mealInput(meal.key)}
                    name={`meal-${index + 1}`}
                    className="sched-edit-meal-name"
                    autoComplete="off"
                    aria-label={t('schedule.mealName', { n: index + 1 })}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? mealError(meal.key) : undefined}
                    value={meal.name}
                    onChange={(event) => dispatch({ type: 'rename', key: meal.key, name: event.target.value })}
                  />
                  <button
                    id={control(meal.key, 'up')}
                    type="button"
                    className="sched-edit-icon"
                    aria-label={t('schedule.moveUp', { name: title(index) })}
                    disabled={index === 0}
                    onClick={() => move(meal.key, index, -1)}
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button
                    id={control(meal.key, 'down')}
                    type="button"
                    className="sched-edit-icon"
                    aria-label={t('schedule.moveDown', { name: title(index) })}
                    disabled={index === meals.length - 1}
                    onClick={() => move(meal.key, index, 1)}
                  >
                    <span aria-hidden="true">↓</span>
                  </button>
                  <button
                    type="button"
                    className="sched-edit-icon sched-edit-remove"
                    aria-label={t('schedule.remove', { name: title(index) })}
                    disabled={meals.length <= 1}
                    onClick={() => remove(meal.key)}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
                {error ? (
                  <p id={mealError(meal.key)} className="field-error" role="alert">
                    {error}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ol>
        <div className="sched-edit-add">
          <button
            ref={addRef}
            type="button"
            className={buttonClass({ variant: 'text' })}
            disabled={meals.length >= MEALS_MAX}
            onClick={add}
          >
            {t('schedule.edit.addMeal')}
          </button>
          {meals.length >= MEALS_MAX ? (
            <span className="sched-edit-note">{t('schedule.mostMeals', { max: MEALS_MAX })}</span>
          ) : null}
        </div>
        <p className="field-hint">{t('schedule.mealsHint')}</p>
      </Fieldset>

      {saveError ? (
        <p className="sched-error" role="alert">
          {saveError}
        </p>
      ) : null}
      <div className="sheet-actions">
        <button type="button" className="sheet-btn sheet-btn-ghost" onClick={onDone}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="sheet-btn sheet-btn-primary"
          aria-busy={saving || undefined}
          onClick={() => void done()}
        >
          {saving ? t('schedule.edit.saving') : t('common.done')}
        </button>
      </div>
    </div>
  )
}
