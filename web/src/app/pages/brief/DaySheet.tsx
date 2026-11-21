import { useId, useState } from 'react'
import type { Plan } from '../../../api/types'
import { useLocale, useT } from '../../i18n/i18n'
import * as planSetup from '../../stores/planSetup'
import { Sheet } from '../../ui/sheet/Sheet'
import { Stepper } from '../../ui/stepper/Stepper'
import { longDay, minimumOn, plannedOn, setMinimum } from './scheduleGrid'
import { capitalised, numberWord, richText } from './words'

/**
 * A day's "at least" sheet (D2's): how many of the day's planned meals must
 * be served, from none up to all of them ("all" is no minimum), with a
 * sentence saying what the choice means. Done saves it; the sheet stays
 * open with the reason when the save fails.
 */
export function DaySheet({
  plan,
  day,
  open,
  onClose,
}: {
  plan: Plan
  day: number
  open: boolean
  onClose: () => void
}) {
  const t = useT()
  const { locale } = useLocale()
  const labelId = useId()
  const errorId = `${labelId}-error`
  const planned = plannedOn(plan, day)
  const current = Math.min(minimumOn(plan, day) ?? planned, planned)
  const [value, setValue] = useState(current)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { weekday, text: title } = longDay(t, locale.code, plan.start_date, day)
  const shown = Math.min(value, planned)

  async function done() {
    if (saving) return
    if (shown === current) {
      onClose()
      return
    }
    setSaving(true)
    setError(null)
    const atLeast = shown >= planned ? null : shown
    const saved = await planSetup.change((latest) => setMinimum(latest, day, atLeast), { optimistic: false })
    setSaving(false)
    if (saved.plan) onClose()
    else
      setError(
        Object.keys(saved.errors).some((field) => field.startsWith('minimums'))
          ? t('schedule.abovePlanned')
          : t('common.saveFailed'),
      )
  }

  const preview =
    planned === 0
      ? t('schedule.grid.sheet.none', { weekday })
      : shown === planned
        ? richText(t, 'schedule.grid.sheet.all', { count: <b>{planned}</b> }, planned)
        : richText(
            t,
            'schedule.grid.sheet.atLeast',
            {
              count: <b>{shown === 0 ? planned : t('schedule.grid.sheet.ofPlanned', { n: shown, planned })}</b>,
            },
            shown,
          )

  return (
    <Sheet open={open} onClose={onClose} title={title} describedBy={error ? errorId : undefined}>
      <p className="sheet-preview" aria-live="polite">
        {preview}
      </p>
      <div className="sched-sheet-row">
        <span className="label sched-sheet-label" id={labelId}>
          {t('schedule.grid.sheet.label')}
        </span>
        <Stepper
          value={shown}
          min={0}
          max={planned}
          labelledBy={labelId}
          decreaseLabel={t('schedule.grid.sheet.fewer')}
          increaseLabel={t('schedule.grid.sheet.more')}
          format={(n) => (n === planned ? t('schedule.all') : n)}
          onChange={(next) => {
            setValue(next)
            setError(null)
          }}
        />
      </div>
      {planned > 0 ? (
        <p className="sched-sheet-hint">
          {capitalised(
            t('schedule.grid.sheet.planned', { weekday, word: numberWord(t, planned) }, planned),
            locale.code,
          )}{' '}
          {t('schedule.grid.sheet.hint')}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="sched-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="sheet-actions">
        <button
          type="button"
          className="sheet-btn sheet-btn-primary"
          aria-busy={saving || undefined}
          onClick={() => void done()}
        >
          {t('common.done')}
        </button>
      </div>
    </Sheet>
  )
}
