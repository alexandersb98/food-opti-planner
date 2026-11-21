import { useState } from 'react'
import { Field } from '../field/Field'
import { Select, type SelectGroup, type SelectOption } from './Select'

const UNITS: (SelectOption | SelectGroup)[] = [
  { value: '', label: 'Choose a unit' },
  {
    group: 'Mass',
    options: [
      { value: 'g', label: 'g' },
      { value: 'kg', label: 'kg' },
    ],
  },
  {
    group: 'Volume',
    options: [
      { value: 'dl', label: 'dl' },
      { value: 'tbsp', label: 'tbsp' },
    ],
  },
  { group: 'This ingredient', options: [{ value: 'clove', label: 'clove' }] },
]

/** Selects: in a field with option groups, and as an annotation in a line. */
export default function SelectSpecimen() {
  const [unit, setUnit] = useState('dl')
  const [inline, setInline] = useState('clove')
  return (
    <div style={{ display: 'grid', gap: 'var(--s5)', maxWidth: '28rem' }}>
      <Field label="Measured in">
        {(control) => <Select {...control} value={unit} onValueChange={setUnit} options={UNITS} />}
      </Field>
      <p className="specimen-serif" style={{ fontSize: 17 }}>
        2{' '}
        <Select
          annotation
          aria-label="Unit of garlic"
          value={inline}
          onValueChange={setInline}
          options={UNITS.slice(1)}
        />{' '}
        garlic, crushed
      </p>
    </div>
  )
}
