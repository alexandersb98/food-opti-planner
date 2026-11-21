import { Button } from './Button'

const row = { display: 'flex', flexWrap: 'wrap', gap: 'var(--s3)', alignItems: 'center' } as const

/** Buttons: the kinds and sizes. */
export default function ButtonSpecimen() {
  return (
    <>
      <div style={row}>
        <Button variant="primary">Save</Button>
        <Button>Cancel</Button>
        <Button variant="accent">Compose the week</Button>
        <Button variant="ghost">Show fewer</Button>
        <Button disabled>Disabled</Button>
      </div>
      <h3 className="specimen-sub">Small, and text buttons</h3>
      <div style={row}>
        <Button small>Use</Button>
        <Button small variant="primary">
          Done
        </Button>
        <Button variant="text">Add goal</Button>
        <Button variant="text-plain">See them</Button>
      </div>
      <p className="specimen-note">
        <code>buttonClass(look)</code> gives the same look to a router link.
      </p>
    </>
  )
}
