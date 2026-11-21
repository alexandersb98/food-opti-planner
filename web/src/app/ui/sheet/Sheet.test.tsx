import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, useState } from 'react'
import { afterEach, expect, test } from 'vitest'
import { I18nProvider } from '../../i18n/i18n'
import { Sheet } from './Sheet'

// Component tests (spec Assumption 1: the focus trap is not cheaply reached
// through the app seam). Rendered in StrictMode, as the app is.

afterEach(cleanup)

function failOnMissing(key: string): never {
  throw new Error(`No message for "${key}"`)
}

function GoalSheet({ beforeClose }: { beforeClose?: () => boolean | Promise<boolean> }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Protein
      </button>
      <button type="button">Add goal</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Edit goal" beforeClose={beforeClose}>
        <label>
          At least <input name="min" />
        </label>
        <button type="button" onClick={() => setOpen(false)}>
          Done
        </button>
      </Sheet>
    </>
  )
}

function setup(beforeClose?: () => boolean | Promise<boolean>) {
  const user = userEvent.setup()
  render(
    <StrictMode>
      <I18nProvider onMissing={failOnMissing}>
        <GoalSheet beforeClose={beforeClose} />
      </I18nProvider>
    </StrictMode>,
  )
  return user
}

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  const opener = screen.getByRole('button', { name: 'Protein' })
  await user.click(opener)
  return { opener, sheet: screen.getByRole('dialog', { name: 'Edit goal' }) }
}

async function expectClosedTo(opener: HTMLElement) {
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(document.activeElement).toBe(opener)
}

test('opening shows a modal dialog named by its title, with focus on the title', async () => {
  const user = setup()
  expect(screen.queryByRole('dialog')).toBeNull()

  const { sheet } = await openSheet(user)

  expect((sheet as HTMLDialogElement).open).toBe(true)
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Edit goal' }))
  expect(sheet.contains(document.activeElement)).toBe(true)
  // swipes are ignored inside it (page turning, ticket 12)
  expect(sheet.hasAttribute('data-no-swipe')).toBe(true)
})

test('Tab and Shift+Tab cycle inside the sheet', async () => {
  const user = setup()
  await openSheet(user)
  const close = screen.getByRole('button', { name: 'Close' })
  const input = screen.getByRole('textbox', { name: 'At least' })
  const done = screen.getByRole('button', { name: 'Done' })

  await user.tab()
  expect(document.activeElement).toBe(close)
  await user.tab()
  expect(document.activeElement).toBe(input)
  await user.tab()
  expect(document.activeElement).toBe(done)
  await user.tab()
  expect(document.activeElement).toBe(close)
  await user.tab({ shift: true })
  expect(document.activeElement).toBe(done)
})

test('Escape closes it and focus returns to the opener', async () => {
  const user = setup()
  const { opener } = await openSheet(user)

  await user.keyboard('{Escape}')

  await expectClosedTo(opener)
})

test('a tap outside the panel closes it; a tap inside does not', async () => {
  const user = setup()
  const { opener, sheet } = await openSheet(user)

  await user.click(screen.getByRole('textbox', { name: 'At least' }))
  await user.click(screen.getByRole('heading', { name: 'Edit goal' }))
  expect(screen.getByRole('dialog')).toBe(sheet)

  // the dialog element itself is the scrim around the panel
  await user.click(sheet)

  await expectClosedTo(opener)
})

test('the close button closes it', async () => {
  const user = setup()
  const { opener } = await openSheet(user)

  await user.click(screen.getByRole('button', { name: 'Close' }))

  await expectClosedTo(opener)
})

test('the caller closing it (Done) also returns focus to the opener', async () => {
  const user = setup()
  const { opener } = await openSheet(user)

  await user.click(screen.getByRole('button', { name: 'Done' }))

  await expectClosedTo(opener)
})

test('beforeClose can keep it open, and lets it close when it agrees', async () => {
  let dirty = true
  const user = setup(() => !dirty)
  const { opener, sheet } = await openSheet(user)

  await user.keyboard('{Escape}')
  await user.click(sheet)
  await user.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.getByRole('dialog')).toBe(sheet)

  dirty = false
  await user.keyboard('{Escape}')
  await expectClosedTo(opener)
})

test('beforeClose may answer later (asking with a Confirm)', async () => {
  let agree: (value: boolean) => void = () => {}
  let asked = 0
  const user = setup(() => {
    asked++
    return new Promise<boolean>((resolve) => (agree = resolve))
  })
  const { opener } = await openSheet(user)

  await user.keyboard('{Escape}')
  // a second request while the first is being asked is ignored
  await user.keyboard('{Escape}')
  expect(asked).toBe(1)
  agree(true)

  await expectClosedTo(opener)
})
