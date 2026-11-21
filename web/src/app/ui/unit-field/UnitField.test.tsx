import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../../i18n/i18n'
import { preferencesStore } from '../../stores/preferences'
import { unitsStore } from '../../stores/units'
import { fakeServer, unitRoutes, type FakeServer } from '../../test-app'
import { UnitField, type UnitGroup } from './UnitField'

// Component tests for the unit field (spec Assumption 1), ported from the Vue
// UnitField tests: grouping, preferred first, typed text kept, keyboard and
// pointer choice, restriction to a kind, and the combobox's semantics.

afterEach(() => {
  unitsStore.reset()
  preferencesStore.reset()
  vi.unstubAllGlobals()
})

interface Options {
  value?: string
  kinds?: UnitGroup[]
  error?: string
  hint?: string
}

/** The field in a parent that keeps the text it is sent, as a form would. */
async function mountField(options: Options = {}, server: FakeServer = unitRoutes()) {
  unitsStore.reset()
  preferencesStore.reset()
  fakeServer(server)
  const sent: string[] = []
  const missing: string[] = []
  function Form() {
    const [value, setValue] = useState(options.value ?? '')
    return (
      <UnitField
        label="Unit"
        value={value}
        onChange={(text) => {
          sent.push(text)
          setValue(text)
        }}
        kinds={options.kinds ?? ['mass', 'volume', 'piece']}
        hint={options.hint}
        error={options.error}
      />
    )
  }
  const user = userEvent.setup()
  render(
    <I18nProvider onMissing={(key) => missing.push(key)}>
      <Form />
    </I18nProvider>,
  )
  await act(() => Promise.all([unitsStore.load(), preferencesStore.load()]))
  expect(missing).toEqual([])
  return { user, sent, box: screen.getByRole<HTMLInputElement>('combobox', { name: 'Unit' }) }
}

type Field = Awaited<ReturnType<typeof mountField>>

/** The open list's rows: group heads as "# Name", options as their text. */
function listed(): string[] {
  const list = screen.queryByRole('listbox')
  if (!list) return []
  return within(list)
    .queryAllByRole('group')
    .flatMap((group) => [
      `# ${document.getElementById(group.getAttribute('aria-labelledby') ?? '')?.textContent}`,
      ...within(group)
        .getAllByRole('option')
        .map((option) => option.textContent ?? ''),
    ])
}

const units = () => listed().filter((row) => !row.startsWith('#'))

async function open({ user, box }: Field) {
  await user.click(box)
  return listed()
}

test('lists mass, volume and other, the preferred unit first in each group', async () => {
  const rows = await open(await mountField())
  const mass = rows.indexOf('# Mass')
  const volume = rows.indexOf('# Volume')
  const other = rows.indexOf('# Other')
  expect([mass, volume, other].every((i) => i >= 0) && mass < volume && volume < other).toBe(true)
  expect(rows.slice(mass + 1, volume)).toEqual([
    'g (gram)',
    'µg (microgram)',
    'mg (milligram)',
    'kg (kilogram)',
    'oz (ounce)',
    'lb (pound)',
  ])
  expect(rows[volume + 1]).toBe('dl (decilitre)')
  expect(rows.slice(volume + 1, other)).toContain('ml (millilitre)')
  expect(rows.slice(other)).toEqual(['# Other', 'st (piece)'])
  expect(rows.some((row) => row.startsWith('kcal') || row === '# Energy')).toBe(false)
})

test('with energy there is an Energy group, kcal first, and no Other group', async () => {
  const rows = await open(await mountField({ kinds: ['mass', 'volume', 'energy'] }))
  const energy = rows.indexOf('# Energy')
  expect(rows.slice(energy)).toEqual(['# Energy', 'kcal (kilocalorie)', 'kJ (kilojoule)'])
  expect(rows).not.toContain('# Other')
  expect(rows).not.toContain('st (piece)')
})

test('restricted to one kind, only that kind is offered', async () => {
  const rows = await open(await mountField({ kinds: ['energy'] }))
  expect(rows).toEqual(['# Energy', 'kcal (kilocalorie)', 'kJ (kilojoule)'])
})

test('a changed preference reorders its group', async () => {
  const rows = await open(await mountField({}, unitRoutes({ 'unit.mass': 'kg' })))
  const mass = rows.indexOf('# Mass')
  expect(rows[mass + 1]).toBe('kg (kilogram)')
  expect(rows[mass + 2]).toBe('µg (microgram)')
  expect(rows.slice(mass + 1, rows.indexOf('# Volume'))).toContain('g (gram)')
})

test('a preference saved while the field is shown reorders the open list', async () => {
  const field = await mountField(
    {},
    { ...unitRoutes(), 'PUT /api/preferences': { body: { ...(unitRoutes()['GET /api/preferences'] as { body: object }).body, 'unit.volume': 'ml' } } },
  )
  await open(field)
  await act(() => preferencesStore.set('unit.volume', 'ml'))
  const rows = listed()
  expect(rows[rows.indexOf('# Volume') + 1]).toBe('ml (millilitre)')
})

test('choosing a unit sends its symbol once, closes the list and the box shows it', async () => {
  const field = await mountField()
  await open(field)
  await field.user.click(screen.getByRole('option', { name: 'kg (kilogram)' }))
  expect(field.sent).toEqual(['kg'])
  expect(field.box.value).toBe('kg')
  expect(document.activeElement).toBe(field.box)
  expect(field.box.getAttribute('aria-expanded')).toBe('false')
  expect(listed()).toEqual([])
})

test('choosing the unit already in the box sends nothing', async () => {
  const field = await mountField({ value: 'dl' })
  await open(field)
  await field.user.click(screen.getByRole('option', { name: 'dl (decilitre)' }))
  expect(field.sent).toEqual([])
})

test('typed text is sent as typed, at every keystroke, and filters the list', async () => {
  const field = await mountField()
  await open(field)
  await field.user.type(field.box, 'gram')
  expect(field.sent).toEqual(['g', 'gr', 'gra', 'gram'])
  await field.user.clear(field.box)
  await field.user.type(field.box, 'tbs')
  expect(field.sent.slice(4)).toEqual(['', 't', 'tb', 'tbs'])
  expect(units()).toEqual(['msk (tablespoon)'])
  await field.user.clear(field.box)
  await field.user.type(field.box, 'zzz')
  expect(field.box.value).toBe('zzz')
  expect(units()).toEqual([])
  expect(field.box.getAttribute('aria-expanded')).toBe('false')
  await field.user.clear(field.box)
  expect(field.sent.at(-1)).toBe('')
})

test('typing a part of a name keeps the entry', async () => {
  const field = await mountField()
  await field.user.type(field.box, 'gra')
  expect(units()).toContain('g (gram)')
})

test('a group head is not an option and cannot be chosen', async () => {
  const field = await mountField()
  await open(field)
  const head = screen.getByText('Mass')
  expect(head.getAttribute('role')).not.toBe('option')
  expect(screen.getAllByRole('option')).toHaveLength(units().length)
  await field.user.click(head)
  expect(field.sent).toEqual([])
})

test('typing into a closed field opens the list filtered', async () => {
  const field = await mountField()
  field.box.focus()
  await field.user.keyboard('tbs')
  expect(field.sent).toEqual(['t', 'tb', 'tbs'])
  expect(units()).toEqual(['msk (tablespoon)'])
})

test('opening and closing the list without a choice sends nothing and keeps the text', async () => {
  const field = await mountField({ value: 'dl' })
  await open(field)
  await field.user.click(document.body)
  expect(field.sent).toEqual([])
  expect(field.box.value).toBe('dl')
  expect(listed()).toEqual([])
})

test('a value that is not in the list is shown as it is', async () => {
  for (const value of ['pcs', 'pinch']) {
    const { box } = await mountField({ value })
    expect(box.value).toBe(value)
    document.body.innerHTML = ''
  }
})

test('without the catalogue the field takes typed text and shows no list', async () => {
  const field = await mountField({}, { 'GET /api/preferences': { body: {} } })
  expect(await open(field)).toEqual([])
  expect(field.box.getAttribute('aria-expanded')).toBe('false')
  await field.user.type(field.box, 'pinch')
  expect(field.sent.at(-1)).toBe('pinch')
  expect(field.box.value).toBe('pinch')
})

test('arrow keys move through the options across groups, Enter chooses', async () => {
  const field = await mountField({ kinds: ['volume', 'energy'] })
  field.box.focus()
  await field.user.keyboard('{ArrowDown}')
  expect(field.box.getAttribute('aria-expanded')).toBe('true')
  const options = screen.getAllByRole('option')
  const active = () => document.getElementById(field.box.getAttribute('aria-activedescendant') ?? '')
  expect(active()).toBe(options[0])
  expect(options[0].getAttribute('aria-selected')).toBe('true')
  // Up from the first wraps to the last (kJ), then down wraps to the first.
  await field.user.keyboard('{ArrowUp}')
  expect(active()?.textContent).toBe('kJ (kilojoule)')
  await field.user.keyboard('{ArrowUp}')
  expect(active()?.textContent).toBe('kcal (kilocalorie)')
  expect(options.filter((o) => o.getAttribute('aria-selected') === 'true')).toHaveLength(1)
  await field.user.keyboard('{Enter}')
  expect(field.sent).toEqual(['kcal'])
  expect(field.box.value).toBe('kcal')
  expect(field.box.getAttribute('aria-expanded')).toBe('false')
  expect(field.box.hasAttribute('aria-activedescendant')).toBe(false)
})

test('ArrowUp on a closed field opens it at the last option', async () => {
  const field = await mountField({ kinds: ['energy'] })
  field.box.focus()
  await field.user.keyboard('{ArrowUp}')
  expect(document.getElementById(field.box.getAttribute('aria-activedescendant')!)?.textContent).toBe('kJ (kilojoule)')
})

test('arrow keys move through a filtered list only', async () => {
  const field = await mountField()
  await field.user.type(field.box, 'litre')
  const shown = units()
  expect(shown.length).toBeGreaterThan(1)
  expect(shown.every((row) => row.includes('litre'))).toBe(true)
  await field.user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
  const second = shown[1].split(' ')[0]
  expect(field.sent.at(-1)).toBe(second)
  expect(field.box.value).toBe(second)
})

test('Escape closes the list, keeps the typed text and does not reach the page; a second Escape does', async () => {
  const field = await mountField()
  const reached = vi.fn()
  document.addEventListener('keydown', reached)
  await field.user.type(field.box, 'tbs')
  await field.user.keyboard('{ArrowDown}{Escape}')
  expect(field.box.getAttribute('aria-expanded')).toBe('false')
  expect(field.box.value).toBe('tbs')
  expect(field.sent.at(-1)).toBe('tbs')
  expect(reached.mock.calls.filter(([event]) => (event as KeyboardEvent).key === 'Escape')).toHaveLength(0)
  await field.user.keyboard('{Escape}')
  expect(reached.mock.calls.filter(([event]) => (event as KeyboardEvent).key === 'Escape')).toHaveLength(1)
  document.removeEventListener('keydown', reached)
})

test('Enter with no active option keeps the typed text', async () => {
  const field = await mountField()
  await field.user.type(field.box, 'gra{Enter}')
  expect(field.sent.at(-1)).toBe('gra')
  expect(field.box.getAttribute('aria-expanded')).toBe('false')
})

test('Tab closes the list without choosing', async () => {
  const field = await mountField()
  await open(field)
  await field.user.keyboard('{ArrowDown}{Tab}')
  expect(field.sent).toEqual([])
  expect(listed()).toEqual([])
})

test('combobox semantics: controls a listbox named by the label, with groups named by their heads', async () => {
  const field = await mountField()
  expect(field.box.getAttribute('aria-autocomplete')).toBe('list')
  expect(field.box.getAttribute('aria-expanded')).toBe('false')
  await open(field)
  expect(field.box.getAttribute('aria-expanded')).toBe('true')
  const list = screen.getByRole('listbox', { name: 'Unit' })
  expect(field.box.getAttribute('aria-controls')).toBe(list.id)
  within(list).getByRole('group', { name: 'Volume' })
})

test('the label names the box, and the hint and error describe it', async () => {
  const { box } = await mountField({ hint: 'What it is measured in.', error: 'Enter a unit.' })
  const description = (box.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent)
  expect(description).toEqual(['What it is measured in.', 'Enter a unit.'])
  expect(box.getAttribute('aria-invalid')).toBe('true')
})

test('without an error the box is not marked invalid', async () => {
  const { box } = await mountField()
  expect(box.hasAttribute('aria-invalid')).toBe(false)
  expect(box.hasAttribute('aria-describedby')).toBe(false)
})
