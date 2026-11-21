import { RuleTag } from './RuleTag'

const noop = () => {}

/** Rule tags: never and only, as buttons and as text, with a note. */
export default function RuleTagSpecimen() {
  return (
    <ul style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s3)', margin: 0, padding: 0, listStyle: 'none' }}>
      <li>
        <RuleTag mode="never" tag="Pork" onClick={noop} />
      </li>
      <li>
        <RuleTag mode="only" tag="Weeknight" onClick={noop} />
      </li>
      <li>
        <RuleTag mode="never" tag="Fish" note="until Friday" />
      </li>
    </ul>
  )
}
