import { expect, test, type Page } from '@playwright/test'

// One flow through the app, growing with each slice that changes it:
// log in, build a small catalog and a recipe from it, then make a plan.

const password = process.env.E2E_PASSWORD
if (!password) throw new Error('Set E2E_PASSWORD to the login password')

async function openPage(page: Page, name: string) {
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.locator('.q-drawer').getByText(name, { exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
}

test('log in, build a catalog of an attribute, a tag and an ingredient, and a recipe', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Plan')

  await openPage(page, 'Attributes')
  await page.getByText('+ New attribute').click()
  await page.getByLabel('Name').fill('Energy')
  await page.getByLabel('Unit').fill('kcal')
  await page.getByLabel('Decimals').fill('0')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.locator('.attribute-row')).toHaveText([/Energy\s*\(kcal\)/])

  await openPage(page, 'Tags')
  await page.getByText('+ New tag').click()
  await page.getByLabel('Name').fill('vegan')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.locator('.tag-row')).toHaveText([/vegan.*added by hand/])

  await openPage(page, 'Ingredients')
  await expect(page.getByText('No ingredients yet.')).toBeVisible()
  await page.getByRole('link', { name: 'New ingredient' }).click()
  await page.getByLabel('Name').fill('Oats')
  await expect(page.getByLabel('Value basis')).toHaveValue('100')
  await page.getByLabel('Energy').fill('389')
  await page.getByRole('button', { name: 'vegan' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.ingredient-row')).toHaveText([/Oats\s*per 100 g · Energy 389 kcal/])

  // Saved, not just shown: it reads back after a reload.
  await page.reload()
  await page.locator('.ingredient-row').click()
  await expect(page.getByLabel('Energy')).toHaveValue('389')
  await expect(page.getByRole('button', { name: 'vegan' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('link', { name: 'Back' }).click()

  // A recipe of the ingredient: totals per portion as typed, and the tag
  // from the ingredient.
  await openPage(page, 'Recipes')
  await expect(page.getByText('No recipes yet.')).toBeVisible()
  await page.getByRole('link', { name: 'New recipe' }).click()
  await page.getByLabel('Name').fill('Porridge')
  await page.getByRole('button', { name: '+ Add ingredient' }).click()
  await page.getByRole('dialog').getByText('Oats').click()
  await page.getByLabel('Amount of Oats').fill('60')
  await expect(page.locator('.portion-total')).toHaveText(['Energy 233 kcal'])
  const vegan = page.getByRole('button', { name: 'vegan' })
  await expect(vegan).toHaveAttribute('aria-pressed', 'true')
  await expect(vegan).toBeDisabled()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.recipe-row')).toHaveText([/Porridge\s*Per portion: Energy 233 kcal\s*vegan/])

  // The ingredient is now in use: it shows the recipe and can't be deleted.
  await openPage(page, 'Ingredients')
  await page.locator('.ingredient-row').click()
  await expect(page.getByText('Used in 1 recipe')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete' })).toBeDisabled()
  await page.getByRole('button', { name: 'Show' }).click()
  await page.getByRole('link', { name: 'Porridge' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Edit recipe')
  await page.getByRole('link', { name: 'Back' }).click()

  // The tag is no longer "added by hand", and deleting the attribute warns
  // about the ingredient value.
  await openPage(page, 'Tags')
  await expect(page.locator('.tag-row')).not.toHaveText([/added by hand/])
  await openPage(page, 'Attributes')
  await page.locator('.attribute-row').click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('dialog')).toContainText('This also removes its values from 1 ingredient')
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()

  // Make a plan: two days in the schedule, then the solve opens the result
  // with the recipe in every meal. Saving returns to the Plan page.
  await openPage(page, 'Plan')
  await page.locator('a[href="/plan/schedule"]').click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Schedule')
  await page.getByLabel('Number of days').fill('2')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Plan')
  await expect(page.locator('.schedule-day')).toHaveCount(2)

  // A goal: at least 100 kcal of Energy each day, a must. The Goals card
  // shows it as typed.
  await page.getByRole('button', { name: '+ Add goal' }).click()
  const goalDialog = page.getByRole('dialog')
  await goalDialog.getByLabel('What to track').click()
  await page.getByRole('option', { name: 'Energy' }).click()
  await goalDialog.getByLabel('Min').fill('100')
  await goalDialog.getByRole('button', { name: 'Each day' }).click()
  await goalDialog.getByRole('button', { name: 'Must', exact: true }).click()
  await goalDialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.goal-row')).toHaveText([/Energy\s*at least 100 kcal\s*Each day\s*Must/])

  // Its name, typed under Advanced, becomes the row's title.
  await page.locator('.goal-row').click()
  await goalDialog.getByText('Advanced').click()
  await goalDialog.getByLabel('Goal name').fill('Energy floor')
  await goalDialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.goal-row')).toHaveText([/Energy floor\s*Energy · at least 100 kcal\s*Each day\s*Must/])

  // Recipe filters: the Recipes card counts the recipes the filters leave.
  // Never vegan leaves none, Only vegan leaves the one; Save shows the chip.
  const recipesCard = page.locator('.recipes-card')
  await expect(recipesCard).toContainText('1 of 1 recipe can be used')
  await recipesCard.getByRole('link', { name: 'Edit' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recipe filters')
  const veganFilter = page.getByLabel('Filter for vegan')
  await veganFilter.getByRole('button', { name: 'Never' }).click()
  await expect(page.locator('.count-line')).toHaveText('0 of 1 recipe can be used')
  await veganFilter.getByRole('button', { name: 'Only' }).click()
  await expect(page.locator('.count-line')).toHaveText('1 of 1 recipe can be used')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Plan')
  await expect(recipesCard.locator('.filter-chip')).toHaveText(['Only: vegan'])
  await expect(recipesCard).toContainText('1 of 1 recipe can be used')

  await page.getByRole('button', { name: 'Make plan' }).click()
  await expect(page.getByText('Best possible plan')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('All goals met')).toBeVisible()
  await expect(page.locator('.miss-row')).toHaveCount(0)
  await expect(page.locator('.day-position')).toContainText('1 of 2')
  await expect(page.locator('.day-line').first()).toContainText(/Energy\s*\d+ kcal/)
  await expect(page.locator('.meal-row')).toHaveText([/Breakfast.*Porridge/, /Lunch.*Porridge/, /Dinner.*Porridge/])
  await page.getByRole('button', { name: 'Next day' }).click()
  await expect(page.locator('.day-position')).toContainText('2 of 2')
  await expect(page.locator('.meal-row')).toHaveText([/Breakfast.*Porridge/, /Lunch.*Porridge/, /Dinner.*Porridge/])
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Plan')
  await expect(page.locator('.saved-plan')).toHaveCount(1)
  await expect(page.locator('.new-plan-card')).toHaveCount(0)

  // Designed at phone width: nothing scrolls sideways.
  const scrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(scrolls).toBe(false)
})
