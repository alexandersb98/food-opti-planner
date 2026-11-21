import { useState } from 'react'
import { Stepper, type StepBy } from './Stepper'

const SECONDS = [5, 10, 15, 30, 60, 120, 300]
/** Uneven steps: to the next or previous stop. */
const bySeconds: StepBy = (value, direction) =>
  direction === 1 ? (SECONDS.find((s) => s > value) ?? value) : (SECONDS.filter((s) => s < value).at(-1) ?? value)

const row = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--s4)' } as const

/** Steppers: a count with ends, and uneven steps shown with a unit. */
export default function StepperSpecimen() {
  const [days, setDays] = useState(7)
  const [seconds, setSeconds] = useState(30)
  return (
    <div style={{ display: 'grid', gap: 'var(--s5)' }}>
      <div style={row}>
        <span className="specimen-serif" id="specimen-days">
          Days in the plan
        </span>
        <Stepper
          labelledBy="specimen-days"
          decreaseLabel="Fewer days"
          increaseLabel="More days"
          value={days}
          min={1}
          max={14}
          onChange={setDays}
        />
      </div>
      <div style={row}>
        <span className="specimen-serif">Up to {seconds} seconds to think it over.</span>
        <Stepper
          label="Most time to spend"
          decreaseLabel="Less time"
          increaseLabel="More time"
          value={seconds}
          min={5}
          max={300}
          step={bySeconds}
          format={(s) => `${s} s`}
          onChange={setSeconds}
        />
      </div>
    </div>
  )
}
