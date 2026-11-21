import { Fragment, useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router'
import type { Plan } from '../../../api/types'
import { dayLabel } from '../../../dates'
import type { Translate } from '../../../translator'
import { useLocale, useT } from '../../i18n/i18n'
import * as planSetup from '../../stores/planSetup'
import { buttonClass } from '../../ui/button/Button'
import { BriefSection } from './BriefSection'
import { DaySheet } from './DaySheet'
import { ScheduleSheet } from './ScheduleSheet'
import { isSkipped, longDay, minimumOn, setCell } from './scheduleGrid'
import { numberWord, richText } from './words'
import './schedule.css'

/** The value of `?sheet=` that opens the schedule sheet (old `/plan/schedule`
 * links, the Editor's note). */
const SHEET_PARAM = 'schedule'

/** "Breakfast, Lunch and Dinner". */
function mealList(t: Translate, names: string[]): string {
  if (names.length < 2) return names[0] ?? ''
  return t('schedule.grid.mealList', {
    list: names.slice(0, -1).join(', '),
    last: names.at(-1)!,
  })
}

/** With four meals or more, a name longer than five letters is shortened
 * in the header on a narrow page ("Breakfast" to "Bre."), as D2 does. */
function shortName(name: string, meals: number): string | null {
  return meals >= 4 && name.length > 5 ? `${name.slice(0, 3)}.` : null
}

/**
 * Section 1 of the brief, the schedule (D2's `#plan`): the start, the days
 * and the meals in a sentence, and the week as a grid of days by meals,
 * each planned meal a place set and each skipped one "out". A tap on a
 * meal skips or plans it and saves at once (taken back, with a note, when
 * the save fails); a tap on a day opens its "at least" sheet. "Change"
 * opens the schedule sheet (start, days and meal names); so does
 * `?sheet=schedule`, which is then removed from the address.
 */
export function ScheduleSection({ plan }: { plan: Plan }) {
  const t = useT()
  const { locale } = useLocale()
  const instructionId = useId()
  const errorId = `${instructionId}-error`
  const [failed, setFailed] = useState(false)
  // The day whose "at least" sheet is open; it stays set while the sheet
  // closes, so the sheet keeps its content. `opened` counts openings, so
  // each starts afresh.
  const [sheetDay, setSheetDay] = useState<{
    day: number
    open: boolean
    opened: number
  } | null>(null)

  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState(false)
  const changeRef = useRef<HTMLButtonElement>(null)

  const asked = params.get('sheet') === SHEET_PARAM
  if (asked && !editing) setEditing(true)
  useEffect(() => {
    if (!asked) return
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('sheet')
        return next
      },
      { replace: true },
    )
  }, [asked, setParams])

  const { start_date: start, days, meals } = plan

  async function tap(day: number, meal: number) {
    setFailed(false)
    const skipped = !isSkipped(plan, day, meal)
    const saved = await planSetup.change((latest) => setCell(latest, day, meal, skipped))
    if (!saved.plan) setFailed(true)
  }

  const sentence = richText(t, 'schedule.grid.sentence', {
    start: <b>{longDay(t, locale.code, start, 0).text}</b>,
    days: <b>{t('brief.standfirst.days', { word: numberWord(t, days) }, days)}</b>,
    meals: mealList(t, meals.map((meal) => meal.name)),
  })

  const change = (
    <button
      ref={changeRef}
      type="button"
      className={buttonClass({ variant: 'text' })}
      aria-label={t('schedule.edit.changeLabel')}
      aria-haspopup="dialog"
      onClick={() => setEditing(true)}
    >
      {t('schedule.edit.change')}
    </button>
  )

  return (
    <BriefSection section="schedule" action={change}>
      <p className="serif-text sched-line">{sentence}</p>
      <div className="sched-wrap">
        <div
          className="sched"
          style={{ '--sched-cols': meals.length } as CSSProperties}
          role="group"
          aria-label={t('schedule.grid.label')}
          aria-describedby={failed ? `${instructionId} ${errorId}` : instructionId}
          data-no-swipe=""
        >
          <div className="sched-h" aria-hidden="true" />
          {meals.map((meal) => {
            const short = shortName(meal.name, meals.length)
            return (
              <div key={meal.id ?? meal.name} className="sched-h" title={short ? meal.name : undefined}>
                {short ? (
                  <>
                    <span className="sched-h-full" aria-hidden="true">
                      {meal.name}
                    </span>
                    <span className="sched-h-short" aria-hidden="true">
                      {short}
                    </span>
                    <span className="visually-hidden">{meal.name}</span>
                  </>
                ) : (
                  meal.name
                )}
              </div>
            )
          })}
          {Array.from({ length: days }, (_, day) => {
            const label = dayLabel(start, day)
            const [weekday, date] = label.split(' ')
            const minimum = minimumOn(plan, day)
            return (
              <Fragment key={day}>
                <button
                  type="button"
                  className="sched-day"
                  aria-label={
                    minimum === null
                      ? t('schedule.grid.day', { day: label })
                      : t('schedule.grid.dayAtLeast', {
                          day: label,
                          n: minimum,
                        })
                  }
                  aria-haspopup="dialog"
                  onClick={() =>
                    setSheetDay((last) => ({
                      day,
                      open: true,
                      opened: (last?.opened ?? 0) + 1,
                    }))
                  }
                >
                  <span className="sched-day-name">
                    {weekday}
                    <span className="sched-day-date">{date}</span>
                  </span>
                  {minimum === null ? null : (
                    <span className="sched-day-al">{t('schedule.grid.atLeast', { n: minimum })}</span>
                  )}
                </button>
                {meals.map((meal, index) => {
                  const skipped = isSkipped(plan, day, index)
                  return (
                    <button
                      key={meal.id ?? meal.name}
                      type="button"
                      className="sched-cell"
                      aria-pressed={!skipped}
                      aria-label={t('schedule.cell', {
                        meal: meal.name,
                        day: label,
                      })}
                      onClick={() => void tap(day, index)}
                    >
                      <span className="sched-mark" aria-hidden="true" />
                      <span className="sched-out" aria-hidden="true">
                        {t('schedule.grid.out')}
                      </span>
                    </button>
                  )
                })}
              </Fragment>
            )
          })}
        </div>
      </div>
      {failed ? (
        <p id={errorId} className="sched-error" role="alert">
          {t('common.saveFailed')}
        </p>
      ) : null}
      <div className="sched-legend" aria-hidden="true">
        <span>
          <i className="sched-key-set" />
          {t('schedule.grid.legendPlanned')}
        </span>
        <span>
          <i className="sched-key-out" />
          {t('schedule.grid.legendSkipped')}
        </span>
      </div>
      <p id={instructionId} className="brief-section-intro">
        {t('schedule.grid.instruction')}
      </p>
      {sheetDay ? (
        <DaySheet
          key={sheetDay.opened}
          plan={plan}
          day={sheetDay.day}
          open={sheetDay.open}
          onClose={() => setSheetDay({ ...sheetDay, open: false })}
        />
      ) : null}
      <ScheduleSheet open={editing} onClose={() => setEditing(false)} plan={plan} finalFocus={changeRef} />
    </BriefSection>
  )
}
