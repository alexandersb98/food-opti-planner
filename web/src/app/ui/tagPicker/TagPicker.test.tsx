import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, test } from 'vitest'
import { I18nProvider } from '../../i18n/i18n'
import { tag } from '../../../test-data'
import { TagPicker } from './TagPicker'

// The picker shows the chosen tags only; the others wait behind "Add a tag",
// narrowed by a find box, so a long catalogue doesn't lengthen the page.

afterEach(cleanup)

const TAGS = ['Vegan', 'Quick', 'Grönsaker', 'Gryn', 'Fisk'].map((name, i) => tag({ id: i + 1, name }))

function mount({ chosen = [2], locked = [] as number[] } = {}) {
  const missing: string[] = []
  const submits: number[] = []
  function Form() {
    const [on, setOn] = useState(() => new Set(chosen))
    const toggle = (id: number) =>
      setOn((previous) => {
        const next = new Set(previous)
        if (!next.delete(id)) next.add(id)
        return next
      })
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submits.push(1)
        }}
      >
        <h2 id="title">Tags</h2>
        <TagPicker labelledBy="title" tags={TAGS} chosen={on} locked={new Set(locked)} lockedNote="auto" onToggle={toggle} />
        <button type="submit">Save</button>
      </form>
    )
  }
  render(
    <I18nProvider onMissing={(key) => missing.push(key)}>
      <Form />
    </I18nProvider>,
  )
  return { user: userEvent.setup(), missing, submits }
}

const chosen = () =>
  within(screen.getByRole('group', { name: 'Tags' }))
    .getAllByRole('button')
    .map((chip) => chip.textContent)
const others = () =>
  within(screen.getByRole('group', { name: 'Other tags' }))
    .getAllByRole('button')
    .map((chip) => chip.textContent)
const find = () => screen.getByRole('searchbox', { name: 'Find a tag' })

test('only the chosen tags show; the rest wait, counted, behind Add a tag', async () => {
  const { user, missing } = mount()
  expect(chosen()).toEqual(['Quick'])
  const add = screen.getByText('Add a tag').closest('details')!
  expect(add.open).toBe(false)
  expect(add.textContent).toContain('4 more')
  await user.click(screen.getByText('Add a tag'))
  expect(others()).toEqual(['Vegan', 'Grönsaker', 'Gryn', 'Fisk'])
  expect(missing).toEqual([])
})

test('the find box narrows the others by name, ignoring case', async () => {
  const { user } = mount()
  await user.click(screen.getByText('Add a tag'))
  await user.type(find(), 'GR')
  expect(others()).toEqual(['Grönsaker', 'Gryn'])
  await user.clear(find())
  await user.type(find(), 'xyz')
  expect(screen.queryByRole('group', { name: 'Other tags' })).toBeNull()
  expect(screen.getByRole('status').textContent).toBe('No tag matches “xyz”.')
})

test('a tag added moves to the chosen ones; a chosen one pressed goes back', async () => {
  const { user } = mount()
  await user.click(screen.getByText('Add a tag'))
  await user.click(screen.getByRole('button', { name: 'Fisk' }))
  expect(chosen()).toEqual(['Quick', 'Fisk'])
  expect(others()).toEqual(['Vegan', 'Grönsaker', 'Gryn'])
  await user.click(within(screen.getByRole('group', { name: 'Tags' })).getByRole('button', { name: 'Quick' }))
  expect(chosen()).toEqual(['Fisk'])
  expect(others()).toEqual(['Vegan', 'Quick', 'Grönsaker', 'Gryn'])
})

test('from the keyboard, the place is kept: the find box after adding, the next chip after taking off', async () => {
  const { user } = mount({ chosen: [1, 2] })
  within(screen.getByRole('group', { name: 'Tags' })).getByRole('button', { name: 'Vegan' }).focus()
  await user.keyboard('{Enter}')
  expect(document.activeElement?.textContent).toBe('Quick')
  await user.click(screen.getByText('Add a tag'))
  screen.getByRole('button', { name: 'Fisk' }).focus()
  await user.keyboard('{Enter}')
  expect(document.activeElement).toBe(find())
})

test('with none chosen it says so', () => {
  mount({ chosen: [] })
  expect(screen.queryByRole('group', { name: 'Tags' })).toBeNull()
  expect(screen.getByText('None yet.')).toBeDefined()
})

test('a locked tag shows chosen, disabled, with its note, and is not offered', async () => {
  const { user } = mount({ chosen: [], locked: [1] })
  const vegan = within(screen.getByRole('group', { name: 'Tags' })).getByRole('button', { name: /Vegan/ })
  expect([vegan.textContent, vegan.getAttribute('aria-pressed'), (vegan as HTMLButtonElement).disabled]).toEqual([
    'Veganauto',
    'true',
    true,
  ])
  await user.click(screen.getByText('Add a tag'))
  expect(others()).not.toContain('Vegan')
})

test('with every tag chosen there is nothing to add', () => {
  mount({ chosen: [1, 2, 3, 4, 5] })
  expect(screen.queryByText('Add a tag')).toBeNull()
})

test('Enter in the find box never saves the form; with one match it adds that tag', async () => {
  const { user, submits } = mount()
  await user.click(screen.getByText('Add a tag'))
  await user.type(find(), 'gr{Enter}')
  expect(chosen()).toEqual(['Quick'])
  await user.type(find(), 'ö{Enter}')
  expect(chosen()).toEqual(['Quick', 'Grönsaker'])
  expect((find() as HTMLInputElement).value).toBe('')
  expect(document.activeElement).toBe(find())
  expect(submits).toEqual([])
})

test('narrowing is announced: how many match, or that none do', async () => {
  const { user } = mount()
  await user.click(screen.getByText('Add a tag'))
  expect(screen.getByRole('status').textContent).toBe('')
  await user.type(find(), 'gr')
  expect(screen.getByRole('status').textContent).toBe('2 tags match')
})

test('taking off the last chosen tag from the keyboard leaves focus on Add a tag', async () => {
  const { user } = mount({ chosen: [2] })
  within(screen.getByRole('group', { name: 'Tags' })).getByRole('button', { name: 'Quick' }).focus()
  await user.keyboard('{Enter}')
  expect(document.activeElement?.textContent).toContain('Add a tag')
})
