import { useState } from 'react'
import { Chip, Chips } from './Chips'

const TAGS = ['Vegetarian', 'Weeknight', 'Batch cook', 'Fish', 'Gluten-free']

/** Chips: toggles, and a tag the recipe gets by itself (disabled, "auto"). */
export default function ChipsSpecimen() {
  const [chosen, setChosen] = useState(() => new Set(['Weeknight']))
  const toggle = (tag: string) =>
    setChosen((previous) => {
      const next = new Set(previous)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  return (
    <Chips label="Tags">
      {TAGS.map((tag) => (
        <Chip key={tag} pressed={chosen.has(tag)} onClick={() => toggle(tag)}>
          {tag}
        </Chip>
      ))}
      <Chip pressed disabled note="auto">
        Dairy
      </Chip>
    </Chips>
  )
}
