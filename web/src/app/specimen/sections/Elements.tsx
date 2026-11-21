/** The base element styles: links, rules, form controls and focus. Buttons
 * here are bare elements; the styled buttons are primitives (ticket 10). */
export default function Elements() {
  return (
    <>
      <p className="specimen-measure">
        A <a href="#elements">link in running text</a> is underlined in a faded ink that turns red on hover.
      </p>

      <h3 className="specimen-sub">Rules</h3>
      <div className="specimen-rules">
        <span className="label">Hairline</span>
        <hr />
        <span className="label">Strong</span>
        <hr className="strong" />
        <span className="label">Double: opens a part</span>
        <hr className="double" />
      </div>

      <h3 className="specimen-sub">Controls</h3>
      <form className="specimen-form" onSubmit={(event) => event.preventDefault()}>
        <div className="specimen-field">
          <label className="label" htmlFor="specimen-name">
            Recipe name
          </label>
          <input id="specimen-name" name="specimen-name" autoComplete="off" placeholder="Braised leeks…" />
        </div>
        <div className="specimen-field">
          <label className="label" htmlFor="specimen-unit">
            Unit
          </label>
          <select id="specimen-unit" name="specimen-unit" defaultValue="g">
            <option value="g">g</option>
            <option value="dl">dl</option>
            <option value="pcs">pcs</option>
          </select>
        </div>
        <div className="specimen-field specimen-wide">
          <label className="label" htmlFor="specimen-method">
            Method
          </label>
          <textarea id="specimen-method" name="specimen-method" rows={3} defaultValue="Soften the leeks in butter." />
        </div>
        <label className="specimen-check">
          <input type="checkbox" name="specimen-vegetarian" defaultChecked /> Vegetarian
        </label>
        <button type="submit" className="specimen-bare">
          A bare button
        </button>
      </form>
      <p className="specimen-note">
        Tab here: every control shows the red-pencil ring with a paper halo; fields draw a red line instead.
      </p>
    </>
  )
}
