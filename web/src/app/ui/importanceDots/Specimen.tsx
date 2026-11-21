import { ImportanceDots } from './ImportanceDots'

/** Importance dots, 1 to 5, beside a Preferred tag as on the brief. */
export default function ImportanceDotsSpecimen() {
  return (
    <ul style={{ display: 'grid', gap: 'var(--s2)', margin: 0, padding: 0, listStyle: 'none' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <li key={n} style={{ display: 'flex', gap: 'var(--s2)', alignItems: 'center' }}>
          <span className="label">Preferred</span>
          <ImportanceDots value={n} />
        </li>
      ))}
    </ul>
  )
}
