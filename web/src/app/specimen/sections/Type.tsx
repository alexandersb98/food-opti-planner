/** The type scale, the two faces and the shared typographic pieces. */

const scale: Array<[step: string, size: string, face: 'serif' | 'sans', sample: string]> = [
  ['hero', '58/56', 'serif', 'The Weekly Table'],
  ['h1', '44/44', 'serif', 'The recipe index'],
  ['h2', '32/36', 'serif', 'This week’s brief'],
  ['h3', '24/28', 'serif', 'Braised leeks with mustard'],
  ['lead', '20/28', 'serif', 'Seven dinners for two, inside forty minutes a night.'],
  ['text', '18/28', 'serif', 'Soften the onions slowly, then add the lentils and stock.'],
  ['body', '16.5/24', 'sans', 'Time allowed per meal, servings and the days you cook.'],
  ['sm', '14/20', 'sans', 'Saved when you close the sheet.'],
  ['xs', '12.5/16', 'sans', 'Plate 14 · per serving'],
]

export default function Type() {
  return (
    <>
      <dl className="specimen-scale">
        {scale.map(([step, size, face, sample]) => (
          <div key={step} className="specimen-step">
            <dt className="label">
              <code translate="no">--fs-{step}</code> <span className="num">{size}</span>
            </dt>
            <dd
              className={face === 'serif' ? 'specimen-serif' : undefined}
              style={{ fontSize: `var(--fs-${step})`, lineHeight: `var(--lh-${step})` }}
            >
              {sample}
            </dd>
          </div>
        ))}
      </dl>

      <div className="specimen-faces">
        <p className="specimen-face specimen-serif">
          Fraunces <em>italic</em>
          <span className="label">Display, headings and reading text</span>
        </p>
        <p className="specimen-face">
          Instrument Sans <em>italic</em>
          <span className="label">Controls, labels and notes</span>
        </p>
      </div>

      <h3 className="specimen-sub">Headings h1 to h4</h3>
      <div className="specimen-headings">
        <h1>Heading one</h1>
        <h2>Heading two</h2>
        <h3>Heading three</h3>
        <h4>Heading four</h4>
      </div>

      <h3 className="specimen-sub">Pieces</h3>
      <p className="kicker">A kicker: an italic serif line, not tracked capitals</p>
      <p className="specimen-sc-line">
        <span className="sc">Small capitals for running heads</span> and <span className="sc">Table Heads</span>
      </p>
      <p className="display specimen-display">
        Display, <em>soft &amp; large</em>
      </p>
      <p className="serif-text dropcap specimen-measure">
        Every dish on the menu was chosen against the brief: the nights you cook, the time allowed and the
        goals for the week. Where a goal could not be met, the editor’s note says which and why, so the
        week can be set again without guessing.
      </p>
      <p className="lead-text specimen-measure">A standfirst in the lead size, set in the serif with old-style figures for 2 people.</p>
    </>
  )
}
