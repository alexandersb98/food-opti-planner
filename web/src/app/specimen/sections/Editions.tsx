import { editionStore, EDITIONS, type Edition } from '../../stores/edition'
import { useEdition } from '../../hooks/useEdition'

const names: Record<Edition, string> = { device: 'Follow the device', paper: 'Paper', evening: 'Evening' }

/** The edition switch, so every section below can be read in both. (Settings
 * gets the real one, ticket 39.) */
export default function Editions() {
  const edition = useEdition()
  return (
    <>
      <div className="specimen-switch" role="group" aria-label="Edition">
        {EDITIONS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={edition === option}
            onClick={() => editionStore.set(option)}
          >
            {names[option]}
          </button>
        ))}
      </div>
      <p className="specimen-note">
        Kept on this device under <code translate="no">planner.edition.v1</code> and applied before the first
        paint; the browser’s toolbar colour follows.
      </p>
    </>
  )
}
