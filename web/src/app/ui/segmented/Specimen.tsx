import { useState } from 'react'
import { Segmented } from './Segmented'

type Mode = 'any' | 'only' | 'never'

/** Segmented controls: full width, and compact beside a name. */
export default function SegmentedSpecimen() {
  const [strict, setStrict] = useState<'must' | 'prefer'>('prefer')
  const [mode, setMode] = useState<Mode>('never')
  return (
    <div style={{ display: 'grid', gap: 'var(--s5)', maxWidth: '28rem' }}>
      <Segmented
        label="How strict"
        value={strict}
        onChange={setStrict}
        options={[
          { value: 'must', label: 'Must' },
          { value: 'prefer', label: 'Prefer' },
        ]}
      />
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 'var(--s3)',
          paddingBottom: 'var(--s2)',
          borderBottom: '1px dotted var(--rule)',
        }}
      >
        <span className="specimen-serif" id="specimen-fish" style={{ flex: '1 1 auto', fontSize: 19 }}>
          Fish
        </span>
        <Segmented
          compact
          labelledBy="specimen-fish"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'any', label: 'Any' },
            { value: 'only', label: 'Only' },
            { value: 'never', label: 'Never' },
          ]}
        />
      </div>
    </div>
  )
}
