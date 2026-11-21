import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, useState } from 'react'
import { afterEach, expect, test } from 'vitest'
import { I18nProvider } from '../../i18n/i18n'
import { Sheet } from '../sheet/Sheet'
import { useConfirm } from './Confirm'

afterEach(cleanup)

function failOnMissing(key: string): never {
  throw new Error(`No message for "${key}"`)
}

function DeleteRecipe({ answers }: { answers: boolean[] }) {
  const [confirm, confirmSheet] = useConfirm()
  async function onDelete() {
    answers.push(
      await confirm({
        title: 'Delete Braised leeks?',
        message: 'It leaves the recipe index.',
        confirmLabel: 'Delete',
        destructive: true,
      }),
    )
  }
  return (
    <>
      <button type="button" onClick={onDelete}>
        Delete recipe
      </button>
      {confirmSheet}
    </>
  )
}

function setup(answers: boolean[]) {
  const user = userEvent.setup()
  render(
    <StrictMode>
      <I18nProvider onMissing={failOnMissing}>
        <DeleteRecipe answers={answers} />
      </I18nProvider>
    </StrictMode>,
  )
  return user
}

async function ask(user: ReturnType<typeof userEvent.setup>) {
  const opener = screen.getByRole('button', { name: 'Delete recipe' })
  await user.click(opener)
  return { opener, question: screen.getByRole('alertdialog', { name: 'Delete Braised leeks?' }) }
}

test('Confirm shows the title and warning, with focus on Cancel', async () => {
  const user = setup([])

  const { question } = await ask(user)

  expect(question.getAttribute('aria-describedby')).toBeTruthy()
  expect(document.getElementById(question.getAttribute('aria-describedby')!)?.textContent).toBe(
    'It leaves the recipe index.',
  )
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
})

test('Confirm resolves with true for the confirm action and returns focus', async () => {
  const answers: boolean[] = []
  const user = setup(answers)
  const { opener } = await ask(user)

  await user.click(screen.getByRole('button', { name: 'Delete' }))

  await waitFor(() => expect(answers).toEqual([true]))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(document.activeElement).toBe(opener)
})

test('Confirm resolves with false for Cancel, Escape and a tap outside', async () => {
  const answers: boolean[] = []
  const user = setup(answers)

  await ask(user)
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())

  await ask(user)
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())

  const { question } = await ask(user)
  await user.click(question)
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())

  expect(answers).toEqual([false, false, false])
})

function NoteSheet({ confirmInside }: { confirmInside: boolean }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [confirm, confirmSheet] = useConfirm()
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Edit note
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Note"
        beforeClose={() =>
          note === '' || confirm({ title: 'Discard the note?', message: 'It is not saved.', confirmLabel: 'Discard' })
        }
      >
        <label>
          Text <input value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        {confirmInside && confirmSheet}
      </Sheet>
      {!confirmInside && confirmSheet}
    </>
  )
}

test.each([
  ['rendered inside the sheet', true],
  ['rendered beside the sheet', false],
])('a sheet with unsaved text asks with a Confirm before closing (Confirm %s)', async (_, confirmInside) => {
  const user = userEvent.setup()
  render(
    <StrictMode>
      <I18nProvider onMissing={failOnMissing}>
        <NoteSheet confirmInside={confirmInside} />
      </I18nProvider>
    </StrictMode>,
  )
  await user.click(screen.getByRole('button', { name: 'Edit note' }))
  const input = screen.getByRole('textbox', { name: 'Text' })
  await user.type(input, 'Buy leeks')

  // Escape asks; Escape on the question closes only the question
  await user.keyboard('{Escape}')
  expect(screen.getByRole('alertdialog', { name: 'Discard the note?' })).toBeDefined()
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(screen.getByRole('dialog', { name: 'Note' })).toBeDefined()
  expect(document.activeElement).toBe(input)

  // asked again by a tap outside (which leaves focus in the field), Discard
  // closes the sheet
  await user.click(screen.getByRole('dialog', { name: 'Note' }))
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(document.activeElement).toBe(input)
  await user.keyboard('{Escape}')
  await user.click(screen.getByRole('button', { name: 'Discard' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit note' }))
})
