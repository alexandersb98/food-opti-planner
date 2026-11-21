import { useCallback } from 'react'
import * as planSetup from '../../stores/planSetup'
import * as solve from '../../stores/solve'

/**
 * Compose the week: waits for the setup's saves to land (a cell tapped just
 * before must count), then starts the solve with the time allowed.
 * Ticket 20 decides here where an outcome leads (The Menu, the Editor's
 * note, or a note on the brief).
 */
export function useCompose(): () => Promise<void> {
  return useCallback(async () => {
    await planSetup.settled()
    const plan = planSetup.getSnapshot().plan
    if (plan) await solve.start(plan.solve_time_limit)
  }, [])
}

/** Ticket 20's place on the brief: the composing view while a solve runs,
 * and the note when one made no plan. Nothing yet. */
export function Composing() {
  return null
}
