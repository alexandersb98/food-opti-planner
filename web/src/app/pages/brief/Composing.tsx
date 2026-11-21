import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type SyntheticEvent,
} from 'react'
import { useNavigate, type NavigateFunction } from 'react-router'
import type { Plan } from '../../../api/types'
import { issueLine } from '../../../dates'
import { useLocale, useT } from '../../i18n/i18n'
import * as planSetup from '../../stores/planSetup'
import * as solve from '../../stores/solve'
import { Button, buttonClass } from '../../ui/button/Button'
import { composedState } from '../menu/composed'
import { richText } from './words'
import './composing.css'

// While a brief is on screen, its way to another page. A solve that ends
// while the owner is elsewhere leaves them there: the brief's new-plan line,
// The Menu's Editor's note or the failure note shows the outcome later.
let briefNavigate: NavigateFunction | null = null

/**
 * Compose the week: waits for the setup's saves to land (a cell tapped just
 * before must count), then starts the solve with the time allowed. When it
 * ends and the owner is still on the brief, a plan opens The Menu (with its
 * reveal) and a clash opens the Editor's note; any other failure stays on
 * the brief as a note.
 */
export function useCompose(): () => Promise<void> {
  return useCallback(async () => {
    await planSetup.settled()
    const plan = planSetup.getSnapshot().plan
    if (!plan) return
    const outcome = await solve.start(plan.solve_time_limit)
    if (outcome?.plan) await briefNavigate?.('/plans/new', { state: composedState })
    else if (outcome?.failure === 'infeasible') await briefNavigate?.('/plans/new')
  }, [])
}

/** The brief's place for the solve: the composing view while one runs (also
 * when the owner comes back to a running one), else the note when the last
 * one made no plan. A clash has the Editor's note instead. */
export function Composing() {
  const state = useSyncExternalStore(solve.subscribe, solve.getSnapshot)
  const navigate = useNavigate()
  useEffect(() => {
    briefNavigate = navigate
    return () => {
      if (briefNavigate === navigate) briefNavigate = null
    }
  }, [navigate])

  if (state.running) return <ComposingView state={state} />
  if (state.failure && state.failure !== 'infeasible') return <FailureNote failure={state.failure} seconds={state.seconds} />
  return null
}

const STATUS_LINES = 5
/** Seconds each status line stays. */
const LINE_SECONDS = 4

/** The browser's clock, read four times a second while mounted. */
function useNow(): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [])
  return now
}

/** The full-screen "Composing the week" (D2's solving view), a native modal
 * dialog: the seconds counted against the time allowed and a ruler (full
 * past it), the galley of days, a status line and Cancel (also Escape). */
function ComposingView({ state }: { state: solve.SolveState }) {
  const t = useT()
  const { locale } = useLocale()
  const plan = useSyncExternalStore(planSetup.subscribe, () => planSetup.getSnapshot().plan)
  const now = useNow()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const leaving = useRef(false)

  // Open modally with focus on Cancel; on leaving, give focus back to what
  // had it (Compose the week), once that can take it again.
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    leaving.current = false
    const opener = document.activeElement
    if (!dialog.open) dialog.showModal()
    cancelRef.current?.focus({ preventScroll: true })
    return () => {
      leaving.current = true
      const focused = document.activeElement
      const ours = !focused || focused === document.body || dialog.contains(focused)
      if (dialog.open) dialog.close()
      if (ours && opener instanceof HTMLElement && opener !== document.body) {
        setTimeout(() => {
          const free = document.activeElement === null || document.activeElement === document.body
          if (free && opener.isConnected) opener.focus({ preventScroll: true })
        })
      }
    }
  }, [])

  const elapsed = Math.max(0, (now - (state.startedAt ?? now)) / 1000)
  const shown = Math.floor(elapsed)
  const max = state.seconds
  const share = max > 0 ? Math.min(1, elapsed / max) : 1
  const line = state.cancelling
    ? t('brief.composing.stoppingLine')
    : t(`brief.composing.lines.${(Math.floor(shown / LINE_SECONDS) % STATUS_LINES) + 1}`)

  function cancel() {
    void solve.cancel()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === 'Escape') {
      // Escape stops the solve; the browser's own cancel would close the
      // dialog, and the shell's Escape (Contents) must not see it.
      event.preventDefault()
      event.stopPropagation()
      cancel()
    } else if (event.key === 'Tab') {
      // Cancel is the only stop.
      event.preventDefault()
      cancelRef.current?.focus()
    }
  }

  function onCancel(event: SyntheticEvent<HTMLDialogElement>) {
    // A close request without a key press (a phone's back gesture).
    event.preventDefault()
    cancel()
  }

  function onClose() {
    // A browser that closes it anyway: it stays while the solve runs.
    const dialog = dialogRef.current
    if (dialog && !leaving.current && !dialog.open) dialog.showModal()
  }

  return (
    <dialog
      ref={dialogRef}
      className="composing"
      data-stopping={state.cancelling ? '' : undefined}
      aria-labelledby="composing-title"
      data-no-swipe=""
      onKeyDown={onKeyDown}
      onCancel={onCancel}
      onClose={onClose}
    >
      <div className="composing-inner">
        <p className="kicker composing-kicker">{plan ? issueLine(t, plan, locale.code) : ' '}</p>
        <h2 className="composing-title display" id="composing-title">
          {richText(t, 'brief.composing.title', { composing: <em>{t('brief.composing.titleWord')}</em> })}
        </h2>
        <p className="composing-count" aria-hidden="true">
          <span className="composing-seconds">{shown}</span>
          <small>{t('brief.composing.of', { max }, max)}</small>
        </p>
        <div
          className="composing-ruler"
          role="progressbar"
          aria-label={t('brief.composing.ruler')}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={Math.min(shown, max)}
          aria-valuetext={t('brief.composing.valueText', { seconds: shown, max }, max)}
        >
          <i style={{ transform: `scaleX(${share})` }} />
        </div>
        {plan ? <Galley plan={plan} locale={locale.code} /> : null}
        <p className="composing-line">{line}</p>
        <button
          ref={cancelRef}
          type="button"
          className={buttonClass({ block: true }, 'composing-cancel')}
          aria-disabled={state.cancelling || undefined}
          onClick={state.cancelling ? undefined : cancel}
        >
          {state.cancelling ? t('brief.composing.stopping') : t('brief.composing.cancel')}
        </button>
      </div>
    </dialog>
  )
}

/** The days of the week being set, each with the meals it will hold; never
 * invented dishes (the server says nothing until it answers). Kept out of
 * the clock's re-renders. */
const Galley = memo(function Galley({ plan, locale }: { plan: Plan; locale: string }) {
  const t = useT()
  const [year, month, day] = plan.start_date.split('-').map(Number)
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
  const list = new Intl.ListFormat(locale, { style: 'short', type: 'unit' })
  const skipped = new Set(plan.skips.map((skip) => `${skip.day}:${skip.meal}`))
  return (
    <ol className="composing-galley" aria-label={t('brief.composing.galley')}>
      {Array.from({ length: plan.days }, (_, index) => {
        const date = new Date(Date.UTC(year!, month! - 1, day! + index))
        const meals = plan.meals.filter((_, meal) => !skipped.has(`${index}:${meal}`)).map((meal) => meal.name)
        return (
          <li key={index} style={{ '--row': index } as CSSProperties}>
            <span className="composing-day sc">
              {weekday.format(date)} {date.getUTCDate()}
            </span>
            <span className="composing-meals">{meals.length ? list.format(meals) : t('brief.composing.nothingToSet')}</span>
          </li>
        )
      })}
    </ol>
  )
})

/** Why the last solve made no plan, and what to try, until dismissed. */
function FailureNote({ failure, seconds }: { failure: Exclude<solve.Failure, 'infeasible'>; seconds: number }) {
  const t = useT()
  const text = failure === 'no_plan_in_time' ? t('brief.failure.no_plan_in_time', seconds) : t(`brief.failure.${failure}`)
  return (
    <div className="composing-failure" role="alert">
      <p className="composing-failure-text">
        <span className="composing-failure-title">{t('brief.failure.title')}</span> {text}
      </p>
      <Button variant="text" className="composing-failure-dismiss" onClick={solve.dismiss}>
        {t('brief.failure.dismiss')}
      </Button>
    </div>
  )
}
