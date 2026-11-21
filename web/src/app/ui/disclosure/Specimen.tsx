import { Disclosure } from './Disclosure'

/** Disclosures: closed, and one that starts open. */
export default function DisclosureSpecimen() {
  return (
    <div style={{ maxWidth: '28rem' }}>
      <Disclosure summary="Advanced">
        <p className="specimen-serif">Count a miss as a percentage of 50 g.</p>
      </Disclosure>
      <Disclosure summary="Never more than" startOpen>
        <p className="specimen-serif">Open from the start, as when a field inside has an error.</p>
      </Disclosure>
    </div>
  )
}
