import { flushPromises } from '@vue/test-utils'
import { QSelect } from 'quasar'
import { afterEach, expect, test, vi } from 'vitest'
import type { Preferences, UnitInfo } from '../api/types'
import { button, click, fakeServer, mountApp, type FakeServer } from '../test-app'

const unit = (symbol: string, category: UnitInfo['category']): UnitInfo => ({ symbol, category, aliases: [] })
const UNITS: UnitInfo[] = [
  unit('mg', 'mass'),
  unit('g', 'mass'),
  unit('kg', 'mass'),
  unit('ml', 'volume'),
  unit('dl', 'volume'),
  unit('kJ', 'energy'),
  unit('kcal', 'energy'),
  unit('st', null),
]
const SAVED: Preferences = { 'unit.mass': 'g', 'unit.volume': 'dl', 'unit.energy': 'kcal' }

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function mountPage(server: FakeServer = {}) {
  const calls = fakeServer({
    'GET /api/session': 204,
    'GET /api/units': { body: UNITS },
    'GET /api/preferences': { body: SAVED },
    ...server,
  })
  const { wrapper } = await mountApp('/settings')
  return { wrapper, calls }
}

type Wrapper = Awaited<ReturnType<typeof mountPage>>['wrapper']

function selects(wrapper: Wrapper) {
  return wrapper.findAllComponents(QSelect)
}

async function choose(wrapper: Wrapper, index: number, symbol: string) {
  selects(wrapper)[index]!.vm.$emit('update:modelValue', symbol)
  await flushPromises()
}

test('the card shows each category with its preferred unit and the help text', async () => {
  const { wrapper } = await mountPage()
  expect(wrapper.get('h1').text()).toBe('Settings')
  const card = wrapper.get('.preferred-units')
  expect(card.get('h2').text()).toBe('Preferred units')
  expect(card.text()).toContain('Changing it converts nothing already saved.')
  expect(selects(wrapper).map((s) => [s.props('label'), s.props('modelValue')])).toEqual([
    ['Mass', 'g'],
    ['Volume', 'dl'],
    ['Energy', 'kcal'],
  ])
  wrapper.unmount()
})

test("each drop-down offers its category's units in catalogue order", async () => {
  const { wrapper } = await mountPage()
  expect(selects(wrapper).map((s) => s.props('options'))).toEqual([
    ['mg', 'g', 'kg'],
    ['ml', 'dl'],
    ['kJ', 'kcal'],
  ])
  wrapper.unmount()
})

test('a change saves only that unit at once and shows what was saved', async () => {
  let sent: unknown
  const { wrapper } = await mountPage({
    'PUT /api/preferences': (body) => {
      sent = body
      return { body: { ...SAVED, 'unit.volume': 'ml' } }
    },
  })
  await choose(wrapper, 1, 'ml')
  expect(sent).toEqual({ 'unit.volume': 'ml' })
  expect(selects(wrapper)[1]!.props('modelValue')).toBe('ml')
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  wrapper.unmount()
})

test('the drop-down being saved is disabled until the answer comes', async () => {
  let answer: (reply: { body: Preferences }) => void = () => {}
  const { wrapper } = await mountPage({
    'PUT /api/preferences': () => new Promise((resolve) => (answer = resolve)),
  })
  await choose(wrapper, 0, 'kg')
  expect(selects(wrapper).map((s) => s.props('disable'))).toEqual([true, false, false])
  answer({ body: { ...SAVED, 'unit.mass': 'kg' } })
  await flushPromises()
  expect(selects(wrapper).map((s) => s.props('disable'))).toEqual([false, false, false])
  expect(selects(wrapper)[0]!.props('modelValue')).toBe('kg')
  wrapper.unmount()
})

test('a failed save keeps the saved unit and says so', async () => {
  const { wrapper } = await mountPage({ 'PUT /api/preferences': 500 })
  await choose(wrapper, 2, 'kJ')
  expect(selects(wrapper)[2]!.props('modelValue')).toBe('kcal')
  expect(wrapper.get('[role="alert"]').text()).toBe('Could not save. Try again.')
  wrapper.unmount()
})

test('a failed load offers Try again', async () => {
  const { wrapper } = await mountPage({ 'GET /api/preferences': 500 })
  expect(wrapper.text()).toContain('Could not load the settings.')
  expect(selects(wrapper)).toHaveLength(0)
  fakeServer({ 'GET /api/session': 204, 'GET /api/units': { body: UNITS }, 'GET /api/preferences': { body: SAVED } })
  await click(button(wrapper, 'Try again'))
  expect(selects(wrapper)).toHaveLength(3)
  wrapper.unmount()
})
