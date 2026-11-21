import { useState } from 'react'
import { UnitField } from './UnitField'

/** The unit field: the catalogue's units grouped by kind, the preferred unit
 * first; typed text is kept. Dev-only copy: not translated. */
export default function UnitFieldSpecimen() {
  const [ingredient, setIngredient] = useState('g')
  const [energy, setEnergy] = useState('')
  const [free, setFree] = useState('pinch')
  return (
    <>
      <p className="specimen-measure">
        Type a unit or pick one. Arrow keys move through the list, Enter takes the unit, Escape closes the list
        and keeps what was typed.
      </p>
      <h3 className="specimen-sub">Fields</h3>
      <div className="specimen-form">
        <UnitField
          label="Measured in"
          value={ingredient}
          onChange={setIngredient}
          kinds={['mass', 'volume', 'piece']}
          hint="Mass, volume or other."
        />
        <UnitField
          label="Energy unit"
          value={energy}
          onChange={setEnergy}
          kinds={['energy']}
          hint="Restricted to one kind."
        />
        <UnitField
          label="Typed unit"
          value={free}
          onChange={setFree}
          kinds={['mass', 'volume', 'energy', 'piece']}
          error={free.trim() ? undefined : 'Enter a unit.'}
        />
      </div>
    </>
  )
}
