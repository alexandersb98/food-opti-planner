import { expect, test, type Page } from '@playwright/test'

// One flow through the app, growing with each slice that changes it:
// log in, set a preferred unit, look at the data source the server loaded from its fixture file
// (its card, page and colour), build a small catalog and a recipe from it (the unit fields are
// combo boxes over the unit catalogue), change the unit of an ingredient in use (its basis and
// recipe amount convert after a dialog), then make a plan, then one that clashes and is fixed,
// then map the source's columns to attributes (and create one from a column), and see what
// that blocks and clears, and finally add an ingredient from a source food (search, preview,
// the chip on its page, mass units only, the duplicate warning) and unlink it, and finally see
// updated source values: two ingredients added from a food, a column mapped afterwards, the
// marker and filter on the list, and the banner on each page answered with Accept and Keep mine,
// and finally make vegan equivalent to a source tag (the rule question, the count of the
// recipe filters) and take it out again. The recipe also gets servings, instructions and a
// source link, then sections with the same ingredient on two lines, which are taken out again.

const password = process.env.E2E_PASSWORD
if (!password) throw new Error('Set E2E_PASSWORD to the login password')

async function openPage(page: Page, name: string) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.locator('.q-drawer').getByText(name, { exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
}

test('log in, build a catalog of an attribute, a tag and an ingredient, and a recipe', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Plan')

  // Settings: the preferred units start at the defaults, and a change is
  // saved, not just shown. It ends as it started: the Oats ingredient below
  // starts in the preferred mass unit and is expected in g.
  await openPage(page, 'Settings')
  const mass = page.locator('.preferred-units-card .q-select').filter({ hasText: 'Mass' })
  await expect(mass).toContainText('g (gram)')
  await expect(page.locator('.preferred-units-card .q-select').filter({ hasText: 'Volume' })).toContainText('dl (decilitre)')
  await expect(page.locator('.preferred-units-card .q-select').filter({ hasText: 'Energy' })).toContainText('kcal (kilocalorie)')
  await mass.click()
  await page.getByRole('option', { name: 'kg (kilogram)' }).click()
  await expect(mass).toContainText('kg (kilogram)')
  await page.reload()
  await expect(mass).toContainText('kg (kilogram)')
  await mass.click()
  await page.getByRole('option', { name: 'g (gram)', exact: true }).click()
  await expect(mass).toContainText('g (gram)')

  // The Data sources card lists the fixture's fake source (the server is
  // started with DATA_SOURCES_DIR=tests/data/data_sources). Its page shows the
  // attribution and columns, and a colour that is saved, not just shown.
  const card = page.locator('.data-sources-card')
  await expect(card.locator('.source-row')).toHaveText([/TEST Source\s*Version 2026-01-01 · 3 foods/])
  await card.getByText('TEST Source').click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('TEST Source')
  await expect(page.getByText('TEST data, not real: for tests only.')).toBeVisible()
  await expect(page.locator('.column-row')).toHaveText([/TEST Energy/, /TEST Protein/, /TEST Vitamin D/])
  await page.getByLabel('Search columns').fill('vit')
  await expect(page.locator('.column-row')).toHaveText([/TEST Vitamin D/])
  await page.getByLabel('Colour').fill('#ff0000')
  await expect(page.getByLabel('Colour')).toHaveValue('#ff0000')
  await page.reload()
  await expect(page.getByLabel('Colour')).toHaveValue('#ff0000')
  await page.getByRole('link', { name: 'Back' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings')

  await openPage(page, 'Attributes')
  await page.getByText('+ New attribute').click()
  await page.getByLabel('Name').fill('Energy')
  // The unit list: mass, volume and energy, not the piece unit; a chosen
  // unit is stored in its catalogue spelling.
  await page.getByLabel('Unit').click()
  const list = page.getByRole('listbox')
  for (const group of ['Mass', 'Volume', 'Energy']) await expect(list.getByText(group, { exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: 'st (piece)' })).toHaveCount(0)
  await page.getByRole('option', { name: 'kcal (kilocalorie)' }).click()
  await expect(page.getByText("The amount per the ingredient's basis, e.g. g or kcal.")).toBeVisible()
  await page.getByLabel('Decimals').fill('0')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.locator('.attribute-row')).toHaveText([/Energy\s*\(kcal\)/])

  await openPage(page, 'Tags')
  await page.getByText('+ New tag').click()
  await page.getByLabel('Name').fill('vegan')
  await page.getByRole('button', { name: 'Done' }).click()
  // The source's food groups are tags too, after the ones made by hand, in the
  // source's colour, without Delete or a Name field.
  const tagRows = page.locator('.tag-row')
  await expect(tagRows).toHaveCount(3)
  await expect(tagRows.first()).toHaveText(/vegan.*added by hand/)
  for (const name of ['TEST Grains', 'TEST Dairy']) {
    const row = tagRows.filter({ hasText: name })
    await expect(row).toContainText('TEST Source')
    await expect(row).not.toContainText('added by hand')
  }
  await tagRows.filter({ hasText: 'TEST Dairy' }).click()
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0)
  await expect(page.getByLabel('Name')).toHaveCount(0)
  await page.getByRole('button', { name: 'Done' }).click()

  await openPage(page, 'Ingredients')
  await expect(page.getByText('No ingredients yet.')).toBeVisible()
  await page.getByRole('link', { name: 'New ingredient' }).click()
  await page.getByLabel('Name').fill('Oats')
  // A new ingredient starts in the preferred mass unit; the list offers
  // pieces but no energy unit.
  await expect(page.getByLabel('Measured in')).toHaveValue('g')
  await expect(page.getByLabel('Value basis')).toHaveValue('100')
  await page.getByLabel('Measured in').click()
  await expect(page.getByRole('option', { name: 'st (piece)' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'kcal (kilocalorie)' })).toHaveCount(0)
  await page.keyboard.press('Escape')
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

  // Changing the unit converts what is stored in it, after a dialog: Cancel
  // changes nothing, Convert changes the unit, the basis and the recipe's
  // amount together, so the recipe's total stays the same.
  await openPage(page, 'Ingredients')
  await page.locator('.ingredient-row').click()
  await page.getByLabel('Measured in').click()
  await page.getByRole('option', { name: 'kg (kilogram)' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  const unitDialog = page.getByRole('dialog')
  await expect(unitDialog).toContainText('Oats: the basis and 1 recipe amount will be converted from g to kg (× 0.001).')
  await unitDialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByLabel('Measured in')).toHaveValue('kg')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Convert' }).click()
  await expect(page.locator('.ingredient-row')).toHaveText([/Oats\s*per 0\.1 kg · Energy 389 kcal/])
  await openPage(page, 'Recipes')
  await page.locator('.recipe-row').click()
  await expect(page.getByLabel('Amount of Oats')).toHaveValue('0.06')
  await expect(page.locator('.portion-total')).toHaveText(['Energy 233 kcal'])
  await page.getByRole('link', { name: 'Back' }).click()

  // Servings, instructions and a source link: Serves 2 halves the per-portion
  // total (the amount is read in kg, as the unit change left it), and all
  // three are saved, not just shown.
  await page.locator('.recipe-row').click()
  await page.getByLabel('Serves').fill('2')
  await expect(page.locator('.portion-total')).toHaveText(['Energy 117 kcal'])
  await page.getByLabel('Instructions').fill('Simmer the oats.')
  await page.getByLabel('Source').fill('https://example.com/porridge')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.recipe-row')).toHaveText([/Porridge\s*Per portion: Energy 117 kcal/])
  await page.locator('.recipe-row').click()
  await expect(page.getByLabel('Serves')).toHaveValue('2')
  await expect(page.getByLabel('Instructions')).toHaveValue('Simmer the oats.')
  await expect(page.getByLabel('Source')).toHaveValue('https://example.com/porridge')
  await expect(page.getByRole('link', { name: 'Open source' })).toHaveAttribute('href', 'https://example.com/porridge')

  // Sections: adding one shows a name field on each; the same ingredient goes
  // on a second line in Topping, and the heading and total follow.
  await expect(page.getByLabel('Section name')).toHaveCount(0)
  await page.getByRole('button', { name: '+ Add section' }).click()
  await page.getByLabel('Section name').nth(0).fill('Porridge')
  await page.getByLabel('Section name').nth(1).fill('Topping')
  await page.getByRole('button', { name: '+ Add ingredient' }).nth(1).click()
  await page.getByRole('dialog').getByText('Oats').click()
  await page.getByLabel('Amount of Oats').nth(1).fill('0.01')
  await expect(page.getByText('Ingredients, for 2 portions')).toBeVisible()
  await expect(page.locator('.portion-total')).toHaveText(['Energy 136 kcal'])
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.recipe-row')).toHaveText([/Porridge\s*Per portion: Energy 136 kcal/])
  await page.locator('.recipe-row').click()
  await expect(page.getByLabel('Section name')).toHaveCount(2)
  await expect(page.getByLabel('Section name').nth(1)).toHaveValue('Topping')
  await expect(page.getByLabel('Amount of Oats')).toHaveCount(2)
  await expect(page.getByLabel('Amount of Oats').nth(1)).toHaveValue('0.01')
  await page.getByRole('link', { name: 'Back' }).click()

  // Two lines of one recipe are one recipe for the ingredient.
  await openPage(page, 'Ingredients')
  await page.locator('.ingredient-row').click()
  await expect(page.getByText('Used in 1 recipe')).toBeVisible()
  await page.getByRole('link', { name: 'Back' }).click()

  // Back to one portion in one section, as the steps below expect: removing
  // Topping moves its line up, which is then removed.
  await openPage(page, 'Recipes')
  await page.locator('.recipe-row').click()
  await page.getByRole('button', { name: 'Remove section' }).nth(1).click()
  await expect(page.getByLabel('Amount of Oats')).toHaveCount(2)
  await page.getByRole('button', { name: 'Remove Oats' }).nth(1).click()
  await page.getByLabel('Serves').fill('1')
  await page.getByLabel('Instructions').fill('')
  await page.getByLabel('Source').fill('')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.recipe-row')).toHaveText([/Porridge\s*Per portion: Energy 233 kcal/])

  // The tag is no longer "added by hand", and deleting the attribute warns
  // about the ingredient value.
  await openPage(page, 'Tags')
  await expect(page.locator('.tag-row').filter({ hasText: 'vegan' })).not.toContainText('added by hand')
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

  // A Must goal no meal can meet: at most 10 kcal each day. No plan is
  // possible; the card names the goal and marks it red in the Goals card.
  // Made Prefer, Try again makes the plan.
  await page.getByRole('button', { name: '+ Add goal' }).click()
  await goalDialog.getByLabel('What to track').click()
  await page.getByRole('option', { name: 'Energy' }).click()
  await goalDialog.getByLabel('Max').fill('10')
  await goalDialog.getByRole('button', { name: 'Each day' }).click()
  await goalDialog.getByRole('button', { name: 'Must', exact: true }).click()
  await goalDialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Make plan' }).click()
  const clashCard = page.locator('.clash-card')
  await expect(clashCard).toContainText('No plan possible', { timeout: 60_000 })
  const clashing = clashCard.locator('.clash-goal', { hasText: 'Energy per day' })
  await expect(clashing).toContainText(/Clashes on \w{3} \d+/)
  await expect(clashing.getByLabel('Max')).toHaveValue('10')
  await expect(page.locator('.goal-row.clashing')).toContainText(['Energy'])
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  await clashing.getByRole('button', { name: 'Make Prefer' }).click()
  await expect(clashing).toContainText('Will be Prefer')
  await clashCard.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Best possible plan')).toBeVisible({ timeout: 60_000 })
  await page.getByRole('link', { name: 'Back' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Plan')
  await expect(page.locator('.clash-card')).toHaveCount(0)
  await expect(page.locator('.goal-row.clashing')).toHaveCount(0)
  await expect(page.locator('.goal-row').nth(1)).toContainText(/at most 10 kcal\s*Each day\s*Prefer/)

  // Column mapping: the source page's Attribute drop-downs. TEST Energy (kcal)
  // is offered Energy only, and the choice is saved, not just shown. TEST
  // Protein (g) gets a new attribute made on the spot, which then shows as
  // taken in the other columns' lists. The card counts the mapped columns.
  await openPage(page, 'Settings')
  await page.locator('.data-sources-card').getByText('TEST Source').click()
  const column = (name: string) => page.locator('.column-row').filter({ hasText: name })
  const attributeSelect = (name: string) => column(name).locator('.q-select')
  await attributeSelect('TEST Energy').click()
  await expect(page.getByRole('option')).toHaveText(['Not mapped', 'Energy', 'Create attribute…'])
  await page.getByRole('option', { name: 'Energy', exact: true }).click()
  await expect(attributeSelect('TEST Energy')).toContainText('Energy')
  await page.reload()
  await expect(attributeSelect('TEST Energy')).toContainText('Energy')

  await attributeSelect('TEST Protein').click()
  await page.getByRole('option', { name: 'Create attribute…' }).click()
  const newAttribute = page.getByRole('dialog')
  await expect(newAttribute.getByLabel('Name')).toHaveValue('')
  await expect(newAttribute.getByLabel('Unit')).toHaveValue('g')
  await newAttribute.getByLabel('Name').fill('Protein')
  await newAttribute.getByLabel('Decimals').fill('1')
  await newAttribute.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(attributeSelect('TEST Protein')).toContainText('Protein')
  await page.reload()
  await expect(attributeSelect('TEST Protein')).toContainText('Protein')

  await attributeSelect('TEST Vitamin D').click()
  const taken = page.getByRole('option', { name: /^Protein/ })
  await expect(taken).toContainText('taken by TEST Protein')
  await expect(taken).toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'Back' }).click()
  await expect(page.locator('.data-sources-card .source-row')).toContainText('2 of 3 columns mapped')

  // An attribute's unit can't change while a column that converts only in the
  // old one is mapped to it; deleting an attribute clears its mapping, after a
  // warning that counts it.
  await openPage(page, 'Attributes')
  await expect(page.locator('.attribute-row')).toHaveCount(2)
  await page.locator('.attribute-row').filter({ hasText: 'Energy' }).click()
  await page.getByLabel('Unit').fill('g')
  await page.keyboard.press('Escape') // closes the unit list
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText(/mapped from TEST Energy \(TEST Source\), which is in kcal/)).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByLabel('Unit').fill('kcal')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.locator('.attribute-row').filter({ hasText: 'Energy' })).toContainText('(kcal)')
  await page.locator('.attribute-row').filter({ hasText: 'Protein' }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('dialog')).toContainText('Its mapping from 1 source column is cleared.')
  await expect(page.getByRole('dialog')).not.toContainText('removes')
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.locator('.attribute-row')).toHaveCount(1)
  await openPage(page, 'Settings')
  await expect(page.locator('.data-sources-card .source-row')).toContainText('1 of 3 columns mapped')
  await page.locator('.data-sources-card').getByText('TEST Source').click()
  await expect(attributeSelect('TEST Protein')).toContainText('Not mapped')
  await expect(attributeSelect('TEST Energy')).toContainText('Energy')

  // Add from data source: TEST Oats is searched, previewed (only Energy is mapped
  // now, in kcal) and added under another name. Its page shows the chip and
  // offers mass units only, and refuses a volume unit. A second look at the
  // food warns about the ingredient made from it. Unlink removes the chip, and
  // keeps the values.
  await openPage(page, 'Ingredients')
  await page.getByRole('button', { name: 'Add from data source' }).click()
  const fromSource = page.getByRole('dialog')
  await expect(fromSource.locator('.q-select')).toContainText('TEST Source')
  await expect(fromSource.locator('.food-row')).toHaveText([/TEST Cheese\s*TEST Dairy/, /TEST Milk\s*TEST Dairy/, /TEST Oats\s*TEST Grains/])
  await fromSource.getByLabel('Search foods').fill('oat')
  await expect(fromSource.locator('.food-row')).toHaveCount(1)
  await fromSource.locator('.food-row').click()
  await expect(fromSource.getByLabel('Name')).toHaveValue('TEST Oats')
  await expect(fromSource).toContainText('Measured in g, values per 100 g')
  await expect(fromSource.locator('.values li')).toHaveText(['Energy 389 kcal'])
  await expect(fromSource.locator('.tag-choice')).toHaveAttribute('aria-pressed', 'true')
  await fromSource.getByLabel('Name').fill('Source oats')
  await fromSource.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Edit ingredient')
  await expect(page.locator('.source-chip')).toHaveText('From TEST Source: TEST Oats')
  await expect(page.getByLabel('Name')).toHaveValue('Source oats')
  await expect(page.getByLabel('Measured in')).toHaveValue('g')
  await expect(page.getByLabel('Energy')).toHaveValue('389')
  await expect(page.locator('.tag-choice', { hasText: 'TEST Grains' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Measured in').click()
  await expect(page.locator('.q-menu .q-item__label--header')).toHaveText(['Mass'])
  await page.keyboard.press('Escape')
  await page.getByLabel('Measured in').fill('dl')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/can only be measured in a mass unit/)).toBeVisible()
  await page.getByLabel('Measured in').fill('g')
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(page.locator('.source-chip')).toHaveText('From TEST Source: TEST Oats')

  await page.getByRole('link', { name: 'Back' }).click()
  await page.getByRole('button', { name: 'Add from data source' }).click()
  await fromSource.getByLabel('Search foods').fill('oat')
  await expect(fromSource.locator('.food-row')).toHaveCount(1)
  await fromSource.locator('.food-row').click()
  await expect(fromSource).toContainText('You already have an ingredient from this food: Source oats')
  await fromSource.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.locator('.ingredient-row').filter({ hasText: 'Source oats' }).click()
  await page.getByRole('button', { name: 'Unlink from source' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Unlink', exact: true }).click()
  await expect(page.locator('.source-chip')).toHaveCount(0)
  await expect(page.getByLabel('Energy')).toHaveValue('389')
  await page.getByLabel('Measured in').click()
  await expect(page.locator('.q-menu .q-item__label--header')).toHaveText(['Mass', 'Volume', 'Other'])
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(page.getByLabel('Name')).toHaveValue('Source oats')
  await expect(page.locator('.source-chip')).toHaveCount(0)

  // Updated values: two ingredients from TEST Oats have no banner. Mapping TEST
  // Protein afterwards (a new attribute, made from the column) gives them a value
  // they never had: the list marks them and filters them. Accept copies the number,
  // Keep mine keeps the ingredient without it, as an explicit 0; neither banner returns.
  await openPage(page, 'Ingredients')
  for (const name of ['Linked A', 'Linked B']) {
    await page.getByRole('button', { name: 'Add from data source' }).click()
    await fromSource.getByLabel('Search foods').fill('oat')
    await expect(fromSource.locator('.food-row')).toHaveCount(1)
    await fromSource.locator('.food-row').click()
    await fromSource.getByLabel('Name').fill(name)
    await fromSource.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByLabel('Name')).toHaveValue(name)
    await expect(page.locator('.source-chip')).toHaveText('From TEST Source: TEST Oats')
    await expect(page.locator('.updated-values')).toHaveCount(0)
    await page.getByRole('link', { name: 'Back' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ingredients')
  }
  await openPage(page, 'Settings')
  await page.locator('.data-sources-card').getByText('TEST Source').click()
  await attributeSelect('TEST Protein').click()
  await page.getByRole('option', { name: 'Create attribute…' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill('Protein')
  await page.getByRole('dialog').getByLabel('Decimals').fill('1')
  await page.getByRole('dialog').getByRole('button', { name: 'Add' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(attributeSelect('TEST Protein')).toContainText('Protein')

  await openPage(page, 'Ingredients')
  const linkedRow = (name: string) => page.locator('.ingredient-row').filter({ hasText: name })
  await expect(linkedRow('Linked A').locator('.updated-marker')).toHaveText('Updated values available')
  await expect(linkedRow('Linked B').locator('.updated-marker')).toHaveText('Updated values available')
  await expect(page.locator('.updated-marker')).toHaveCount(2)
  await expect(page.locator('.updated-filter')).toHaveText('Only with updated values (2)')
  await page.locator('.updated-filter').click()
  await expect(page.locator('.ingredient-row')).toHaveText([/Linked A/, /Linked B/])
  await page.locator('.updated-filter').click()

  await linkedRow('Linked A').click()
  await expect(page.locator('.updated-values li')).toHaveText(['Protein none → 13.5 g'])
  await page.locator('.accept-updates').click()
  await expect(page.locator('.updated-values')).toHaveCount(0)
  await expect(page.getByLabel('Protein')).toHaveValue('13.5')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ingredients')
  await expect(linkedRow('Linked A')).toContainText('Protein 13.5 g')
  await expect(linkedRow('Linked A').locator('.updated-marker')).toHaveCount(0)

  await linkedRow('Linked B').click()
  await page.locator('.keep-updates').click()
  await expect(page.locator('.updated-values')).toHaveCount(0)
  await expect(page.getByLabel('Protein')).toHaveValue('0')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ingredients')
  await linkedRow('Linked B').click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Edit ingredient')
  await page.reload()
  await expect(page.getByLabel('Protein')).toHaveValue('0')
  await expect(page.locator('.updated-values')).toHaveCount(0)
  await page.getByRole('link', { name: 'Back' }).click()
  await expect(page.locator('.updated-filter')).toHaveCount(0)
  await expect(page.locator('.updated-marker')).toHaveCount(0)

  // Equivalent tags: vegan (all) and the source tag TEST Grains (any). Adding it asks to switch
  // its rule; the filters then treat them as one, and removing the chip undoes that.
  await openPage(page, 'Tags')
  const tagRow = (name: RegExp) => page.locator('.tag-row').filter({ hasText: name })
  await tagRow(/^vegan/).click()
  await page.getByLabel('Add equivalent tag').click()
  await page.getByRole('option', { name: 'TEST Grains' }).click()
  await expect(page.locator('.equivalent-chip .q-chip__content')).toHaveText(['TEST Grains'])
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('dialog')).toContainText(
    'TEST Grains gets a recipe tag when any ingredient has it; the group uses all. Switch TEST Grains to all?',
  )
  await page.getByRole('dialog').getByRole('button', { name: 'Switch' }).click()
  await expect(tagRow(/^vegan/)).toContainText('When all ingredients have it · equivalent to TEST Grains')
  await expect(tagRow(/^TEST Grains/)).toContainText('When all ingredients have it · equivalent to vegan')

  // Only vegan is saved, so Never TEST Grains contradicts it; a recipe fails that only if the two
  // are one tag. Unsaved: the page is left again.
  const filterCount = async (mode: string) => {
    await openPage(page, 'Plan')
    await page.locator('.recipes-card').getByRole('link', { name: 'Edit' }).click()
    await page.getByLabel('Filter for TEST Grains').getByRole('button', { name: mode }).click()
  }
  await filterCount('Never')
  await expect(page.locator('.count-line')).toHaveText('0 of 1 recipe can be used')

  await openPage(page, 'Tags')
  await tagRow(/^TEST Grains/).click()
  await page.locator('.equivalent-chip').filter({ hasText: 'vegan' }).locator('.q-chip__icon--remove').click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(tagRow(/^vegan/)).not.toContainText('equivalent to')
  await expect(tagRow(/^TEST Grains/)).not.toContainText('equivalent to')
  await filterCount('Never')
  await expect(page.locator('.count-line')).toHaveText('1 of 1 recipe can be used')

  // Designed at phone width: nothing scrolls sideways.
  const scrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(scrolls).toBe(false)
})
