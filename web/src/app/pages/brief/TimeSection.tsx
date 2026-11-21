import { useId, useState } from 'react'
import { useT } from '../../i18n/i18n'
import * as planSetup from '../../stores/planSetup'
import { Stepper } from '../../ui/stepper/Stepper'
import { BriefSection, briefSections, headingId } from './BriefSection'
import { richText } from './words'

/** The server's limits for the time allowed (the solve runs inside the
 * request: at most 5 minutes). */
export const TIME_LIMIT = { min: 1, max: 300 }

/** The next time allowed one step down or up: steps of 5 s up to a minute
 * and of 30 s above, from any value (47 → 50 or 45, 75 → 90 or 60). */
export function stepTime(seconds: number, direction: -1 | 1): number {
  const step = direction > 0 ? (seconds >= 60 ? 30 : 5) : seconds > 60 ? 30 : 5
  return direction > 0 ? Math.floor(seconds / step) * step + step : Math.ceil(seconds / step) * step - step
}

/** The seconds typed, or null unless a whole number within the limits. */
function typedSeconds(text: string): number | null {
  const typed = text.trim()
  if (!/^\d+$/.test(typed)) return null
  const seconds = Number(typed)
  return seconds >= TIME_LIMIT.min && seconds <= TIME_LIMIT.max ? seconds : null
}

/**
 * Section 4 of the brief: how long the planner may think. The figure in
 * the sentence is a field for any whole number of seconds (saved when it is
 * left or on Enter), and the stepper moves in D2's steps. Each change is
 * saved with the rest of the setup at once, and taken back with a note if
 * the save fails.
 */
export function TimeSection({ seconds }: { seconds: number }) {
  const t = useT()
  const inputId = useId()
  const errorId = `${inputId}-error`
  // What is being typed; null shows the saved value.
  const [typed, setTyped] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const range = t('plan.maxTimeRange', TIME_LIMIT)

  async function save(next: number) {
    setError(null)
    const saved = await planSetup.change((plan) => ({ ...plan, solve_time_limit: next }))
    if (!saved.plan) setError(saved.errors.solve_time_limit ? range : t('common.saveFailed'))
  }

  function commit() {
    if (typed === null) return
    const next = typedSeconds(typed)
    if (next === null) {
      setError(range)
      return
    }
    setTyped(null)
    setError(null)
    if (next !== seconds) void save(next)
  }

  function step(next: number) {
    setTyped(null)
    void save(next)
  }

  const shown = typed ?? String(seconds)
  const field = (
    <input
      id={inputId}
      className="brief-time-input"
      name="solve_time_limit"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      enterKeyHint="done"
      // wide enough for what is typed, in any browser
      size={Math.max(2, shown.length)}
      aria-label={t('brief.time.input')}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      value={shown}
      onChange={(event) => setTyped(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commit()
        } else if (event.key === 'Escape' && typed !== null) {
          setTyped(null)
          setError(null)
        }
      }}
    />
  )

  return (
    <BriefSection section="time">
      <div className="brief-time-row">
        <p className="serif-text brief-time-text">{richText(t, 'brief.time.sentence', { seconds: field }, seconds)}</p>
        <Stepper
          value={seconds}
          min={TIME_LIMIT.min}
          max={TIME_LIMIT.max}
          step={stepTime}
          labelledBy={headingId(briefSections[3].id)}
          decreaseLabel={t('brief.time.less')}
          increaseLabel={t('brief.time.more')}
          format={(value) => t('plan.seconds', { n: value })}
          onChange={step}
        />
      </div>
      {error ? (
        <p id={errorId} className="brief-time-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="brief-section-intro">{t('brief.time.note')}</p>
    </BriefSection>
  )
}
