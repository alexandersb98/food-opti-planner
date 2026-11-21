import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import type { Ingredient } from '../../../api/types'
import { attribute, tag } from '../../../test-data'
import { I18nProvider } from '../../i18n/i18n'
import { preferencesStore } from '../../stores/preferences'
import { unitsStore } from '../../stores/units'
import { fakeServer, unitRoutes, type FakeServer } from '../../test-app'
import { Sheet } from '../../ui/sheet/Sheet'
import { IngredientForm } from './IngredientForm'

// The ingredient form inside a sheet, as ticket 35's "+ New ingredient" uses
// it: a starting name, Save at the foot, and the saved ingredient reported.
// Ported from the Vue IngredientForm and NewIngredientDialog tests.

afterEach(() => {
  vi.unstubAllGlobals()
})

const protein = attribute({ id: 2, name: 'Protein', unit: 'g' })
const vegan = tag({ id: 1, name: 'vegan' })

async function mountSheet(server: FakeServer = {}, initialName?: string) {
  unitsStore.reset()
  preferencesStore.reset()
  const calls = fakeServer({
    ...unitRoutes({ 'unit.mass': 'g' }),
    'GET /api/attributes': { body: [protein] },
    'GET /api/tags': { body: [vegan] },
    ...server,
  })
  const saved: Ingredient[] = []
  const missing: string[] = []
  function Host() {
    const [open, setOpen] = useState(true)
    return (
      <Sheet open={open} onClose={() => setOpen(false)} title="New ingredient">
        <IngredientForm
          id={null}
          initialName={initialName}
          inSheet
          onSaved={(ingredient) => {
            saved.push(ingredient)
            setOpen(false)
          }}
        />
      </Sheet>
    )
  }
  const user = userEvent.setup()
  render(
    <I18nProvider onMissing={(key) => missing.push(key)}>
      <MemoryRouter>
        <Host />
      </MemoryRouter>
    </I18nProvider>,
  )
  const sheet = await screen.findByRole('dialog', { name: 'New ingredient' })
  await within(sheet).findByRole('textbox', { name: 'Name' })
  await waitFor(() => expect(calls).toContain('GET /api/preferences'))
  expect(missing).toEqual([])
  return { user, sheet, saved, calls }
}

test('a new ingredient starts with the initial name, and saving reports the stored ingredient', async () => {
  const sent: unknown[] = []
  const stored = { id: 9, name: 'Kale', unit: 'g', basis: '100', values: [], tag_ids: [1], recipe_count: 0, source: null, conversions: [], updated_values: [] }
  const { user, sheet, saved } = await mountSheet(
    {
      'POST /api/ingredients': (body) => {
        sent.push(body)
        return { status: 201, body: stored }
      },
    },
    'Kale',
  )
  const name = within(sheet).getByRole<HTMLInputElement>('textbox', { name: 'Name' })
  expect(name.value).toBe('Kale')
  // no page heading or back link inside a sheet
  expect(within(sheet).queryByRole('heading', { level: 1 })).toBeNull()
  expect(within(sheet).queryByRole('link')).toBeNull()
  expect(within(sheet).queryByRole('heading', { name: 'Conversions' })).toBeNull()

  await user.click(within(sheet).getByRole('button', { name: 'vegan' }))
  await user.click(within(sheet).getByRole('button', { name: 'Save' }))
  expect(sent).toEqual([{ name: 'Kale', unit: 'g', basis: '100', values: [], tag_ids: [1] }])
  expect(saved).toEqual([stored])
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

test('without an initial name the form starts empty, and a missing name is marked and nothing sent', async () => {
  const { user, sheet, saved, calls } = await mountSheet()
  const name = within(sheet).getByRole<HTMLInputElement>('textbox', { name: 'Name' })
  expect(name.value).toBe('')
  await user.click(within(sheet).getByRole('button', { name: 'Save' }))
  expect(name.getAttribute('aria-invalid')).toBe('true')
  expect(within(sheet).getByRole('alert').textContent).toBe('Enter a name.')
  expect(calls).not.toContain('POST /api/ingredients')
  expect(saved).toEqual([])
  expect(screen.getByRole('dialog', { name: 'New ingredient' })).toBeDefined()
})

test('the unit list opens inside the sheet and Escape closes the list before the sheet', async () => {
  const { user, sheet } = await mountSheet()
  const unit = within(sheet).getByRole('combobox', { name: 'Measured in' })
  await user.click(unit)
  const list = within(sheet).getByRole('listbox', { name: 'Measured in' })
  await user.click(within(list).getByRole('option', { name: 'st (piece)' }))
  expect((unit as HTMLInputElement).value).toBe('st')
  expect(within(sheet).getByRole<HTMLInputElement>('textbox', { name: 'Value basis' }).value).toBe('1')

  await user.click(unit)
  expect(unit.getAttribute('aria-expanded')).toBe('true')
  await user.keyboard('{Escape}')
  expect(unit.getAttribute('aria-expanded')).toBe('false')
  expect(screen.getByRole('dialog', { name: 'New ingredient' })).toBeDefined()
})
