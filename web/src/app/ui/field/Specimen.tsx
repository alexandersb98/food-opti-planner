import { useState } from 'react'
import { Segmented } from '../segmented/Segmented'
import { Field, Fieldset } from './Field'

/** Field and Fieldset: label, hint and an error that comes and goes as you type. */
export default function FieldSpecimen() {
  const [name, setName] = useState('Lentil & tomato soup')
  const [minutes, setMinutes] = useState('forty')
  const [scope, setScope] = useState<'day' | 'plan'>('day')
  const minutesError = /^\d+$/.test(minutes.trim()) ? undefined : 'A whole number of minutes, such as 40.'
  return (
    <div style={{ display: 'grid', gap: 'var(--s5)', maxWidth: '28rem' }}>
      <Field label="Name" hint="Shown on the Menu and in the index.">
        {(control) => (
          <input {...control} name="specimen-dish" value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" />
        )}
      </Field>
      <Field label="Minutes" hint="From the first chop to the table." error={minutesError}>
        {(control) => (
          <input
            {...control}
            name="specimen-minutes"
            inputMode="numeric"
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            autoComplete="off"
          />
        )}
      </Field>
      <Fieldset legend="Applies to" hint="A goal holds for each day, or for the week as a whole.">
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: 'day', label: 'Each day' },
            { value: 'plan', label: 'Whole plan' },
          ]}
        />
      </Fieldset>
    </div>
  )
}
