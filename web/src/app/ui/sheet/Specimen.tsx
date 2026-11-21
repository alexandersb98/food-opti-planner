import { useState } from 'react'
import { useConfirm } from '../confirm/Confirm'
import { Sheet } from './Sheet'

/** Specimen section: the Sheet in its three uses and a Confirm. Dev-only
 * copy, not translated. */
export default function SheetSpecimen() {
  const [which, setWhich] = useState<'day' | 'note' | 'full' | null>(null)
  const [atLeast, setAtLeast] = useState('2')
  const [note, setNote] = useState('')
  const [answer, setAnswer] = useState('')
  const [confirm, confirmSheet] = useConfirm()
  const close = () => setWhich(null)

  async function deleteRecipe() {
    const deleted = await confirm({
      title: 'Delete Braised leeks?',
      message: 'It leaves the recipe index. Saved plans keep the meals they were made with.',
      confirmLabel: 'Delete recipe',
      destructive: true,
    })
    setAnswer(deleted ? 'Deleted.' : 'Kept.')
  }

  const served = Number(atLeast)

  return (
    <>
      <p className="specimen-measure">
        Sheets slide up from the foot of the page with a grip, a title and a close button. Escape, a tap
        outside or the close button closes them, and focus goes back to the button that opened them.
      </p>
      <div className="sheet-actions">
        <button type="button" className="sheet-btn sheet-btn-ghost" onClick={() => setWhich('day')}>
          Thursday’s meals
        </button>
        <button type="button" className="sheet-btn sheet-btn-ghost" onClick={() => setWhich('note')}>
          A note that asks before closing
        </button>
        <button type="button" className="sheet-btn sheet-btn-ghost" onClick={() => setWhich('full')}>
          A full-screen sheet
        </button>
        <button type="button" className="sheet-btn sheet-btn-ghost" onClick={deleteRecipe}>
          Delete a recipe…
        </button>
      </div>
      <p className="specimen-note" aria-live="polite">
        {answer && `Confirm answered: ${answer}`}
      </p>

      <Sheet open={which === 'day'} onClose={close} title="Thursday 23 November">
        <p className="sheet-preview" aria-live="polite">
          {Number.isInteger(served) && served >= 0 && served < 3 ? (
            <>
              At least <b>{served} of 3 meals</b> are served on Thursday.
            </>
          ) : (
            <>
              <b>All 3 meals</b> are served on Thursday.
            </>
          )}
        </p>
        <div className="specimen-field">
          <label className="label" htmlFor="specimen-at-least">
            Meals served, at least
          </label>
          <input
            id="specimen-at-least"
            name="specimen-at-least"
            inputMode="numeric"
            autoComplete="off"
            value={atLeast}
            onChange={(event) => setAtLeast(event.target.value)}
          />
        </div>
        <p className="specimen-note">Three meals are planned on Thursday. “At least” lets the planner leave some of them empty.</p>
        <div className="sheet-actions">
          <button type="button" className="sheet-btn sheet-btn-primary" onClick={close}>
            Done
          </button>
        </div>
      </Sheet>

      <Sheet
        open={which === 'note'}
        onClose={close}
        title="A note for the week"
        beforeClose={() =>
          note === '' ||
          confirm({
            title: 'Throw away the note?',
            message: 'What you typed is not saved.',
            confirmLabel: 'Throw away',
            cancelLabel: 'Keep writing',
            destructive: true,
          })
        }
      >
        <div className="specimen-field">
          <label className="label" htmlFor="specimen-note-text">
            Note
          </label>
          <textarea
            id="specimen-note-text"
            name="specimen-note-text"
            rows={3}
            autoComplete="off"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Type, then press Escape…"
          />
        </div>
        <div className="sheet-actions">
          <button type="button" className="sheet-btn sheet-btn-primary" onClick={close}>
            Done
          </button>
        </div>
      </Sheet>

      <Sheet open={which === 'full'} onClose={close} title="Add from data source" fullScreen>
        <p className="specimen-measure">
          The full-screen variant fills the phone, or the page column on a desktop, for long searches.
        </p>
        <ul className="sheet-specimen-list">
          {foods.map((food) => (
            <li key={food}>{food}</li>
          ))}
        </ul>
      </Sheet>

      {confirmSheet}
    </>
  )
}

const foods = [
  'Leek, raw',
  'Leek, boiled',
  'Lentils, green, dried',
  'Lentils, red, boiled',
  'Lettuce, iceberg',
  'Lime, juice',
  'Linseed',
  'Lemon, peel',
  'Lamb, shoulder',
  'Langoustine',
  'Lard',
  'Lingonberries',
]
