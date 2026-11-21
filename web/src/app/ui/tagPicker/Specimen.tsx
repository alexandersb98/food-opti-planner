import { useState } from 'react'
import { tag } from '../../../test-data'
import { TagPicker } from './TagPicker'

const TAGS = ['Vegetarian', 'Weeknight', 'Batch cook', 'Fish', 'Gluten-free', 'Dairy', 'Grains', 'Vegetables'].map((name, i) =>
  tag({ id: i + 1, name }),
)

/** The tag picker: chosen tags, a locked one ("auto"), and the others to add. */
export default function TagPickerSpecimen() {
  const [chosen, setChosen] = useState<ReadonlySet<number>>(() => new Set([2]))
  const toggle = (id: number) =>
    setChosen((previous) => {
      const next = new Set(previous)
      if (!next.delete(id)) next.add(id)
      return next
    })
  return (
    <div style={{ maxWidth: '28rem' }}>
      <h3 className="kicker" id="specimen-tag-picker">
        Tags
      </h3>
      <TagPicker labelledBy="specimen-tag-picker" tags={TAGS} chosen={chosen} locked={new Set([6])} lockedNote="auto" onToggle={toggle} />
    </div>
  )
}
