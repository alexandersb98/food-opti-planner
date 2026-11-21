import { useRef } from 'react'
import { useLoad } from '../../hooks/useLoad'
import { LoadState } from './LoadState'

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => clearTimeout(timer))
  })

const noop = () => {}

/** LoadState and the load hook: each state, and a live load that fails the
 * first time and answers on "Try again". */
export default function LoadStateSpecimen() {
  const attempts = useRef(0)
  const live = useLoad(async (signal) => {
    await wait(1200, signal)
    attempts.current += 1
    return attempts.current % 2 === 1 ? {} : { data: 'The pantry is stocked: 16 ingredients, 8 recipes.' }
  })
  return (
    <>
      <h3 className="specimen-sub">Loading</h3>
      <LoadState of={{ loading: true, failed: false, reload: noop }} />
      <h3 className="specimen-sub">Failed</h3>
      <LoadState of={{ loading: false, failed: true, reload: noop }} message="Could not load the recipes." />
      <h3 className="specimen-sub">Live: fails first, then answers</h3>
      {live.data ? <p className="specimen-measure">{live.data}</p> : <LoadState of={live} />}
    </>
  )
}
