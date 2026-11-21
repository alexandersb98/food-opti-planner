import { screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { fakeServer, mountApp } from '../../test-app'

// Through the specimen page.

test('a stepper stops at its ends and announces its value', async () => {
  fakeServer({})
  const { user } = await mountApp('/specimen')
  const steppers = await screen.findByRole('region', { name: 'Steppers' }, { timeout: 5000 })
  const time = await within(steppers).findByRole('group', { name: 'Most time to spend' })
  const less = within(time).getByRole('button', { name: 'Less time' })
  const more = within(time).getByRole('button', { name: 'More time' })
  expect(within(time).getByRole('status').textContent).toBe('30 s')

  await user.click(more)
  expect(within(time).getByRole('status').textContent).toBe('60 s')
  await user.click(less)
  await user.click(less)
  await user.click(less)
  await user.click(less)

  expect(within(time).getByRole('status').textContent).toBe('5 s')
  expect(less).toHaveProperty('disabled', true)
  expect(more).toHaveProperty('disabled', false)
})
