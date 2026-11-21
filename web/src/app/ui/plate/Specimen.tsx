import { Plate } from './Plate'

const IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

/** Plates: the four dishes as on the spread, and the index swatches; each
 * recipe id keeps its hue. */
export default function PlateSpecimen() {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--s4)' }}>
        {IDS.slice(0, 4).map((id) => (
          <figure key={id} style={{ margin: 0 }}>
            <div style={{ height: 154, overflow: 'hidden', border: '1px solid var(--rule)' }}>
              <Plate id={id} label={`Colour plate for recipe ${id}`} />
            </div>
            <figcaption className="kicker">Recipe {id}</figcaption>
          </figure>
        ))}
      </div>
      <h3 className="specimen-sub">Swatches, recipes 1–12</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s3)' }}>
        {IDS.map((id) => (
          <Plate key={id} id={id} variant="swatch" />
        ))}
      </div>
    </>
  )
}
