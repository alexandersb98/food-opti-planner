import { expect, test, type Page } from '@playwright/test'

// One flow through the app: log in, set a preferred unit, look at the data
// source the server loaded from its fixture file (its page and colour), build
// a small catalogue and a recipe from it (the unit fields are combo boxes over
// the unit catalogue), change the unit of an ingredient in use (its basis and
// recipe amount convert after a question), then compose a week from the brief
// and file it in the archive, then one that clashes and is fixed from the
// Editor's note, then map the source's columns to attributes (and create one
// from a column), and see what that blocks and clears, then add an ingredient
// from a source food (search, preview, the source line on its page, mass
// units only, the duplicate warning) and unlink it, then updated source values
// (two ingredients added from a food, a column mapped afterwards, the marker
// and filter on the list, Accept and Keep mine), then make vegan equivalent to
// a source tag (the rule question, the recipe filters' count) and take it out
// again. The recipe also gets servings, a method and a source link, and
// sections, which are taken out again. Then line units and conversions, and
// import from a link (only what is refused before any connection) and from
// pasted text with the server's fake AI provider (AI_PROVIDER=fake): the two
// errors, the review of a draft (a new ingredient made on the spot, a factor
// accepted, a line skipped), the saved recipe and the conversion it made, and
// leaving an unsaved draft.

const password = process.env.E2E_PASSWORD
if (!password) throw new Error('Set E2E_PASSWORD to the login password')

/** The page's title (its level-1 heading). */
const title = (page: Page) => page.getByRole('heading', { level: 1 })

/** Turns to a page through the Contents (the masthead's table of contents). */
async function openPage(page: Page, name: string, heading = name) {
  await page.getByRole('button', { name: 'Contents', exact: true }).click()
  const contents = page.getByRole('dialog', { name: 'Contents' })
  await contents.getByRole('link', { name: new RegExp(`^${name}\\b`) }).click()
  await expect(contents).toBeHidden()
  await expect(title(page)).toHaveText(heading)
}

/** Does `action` and waits for the server to answer the call it makes. */
async function sent(page: Page, method: string, path: RegExp, action: () => Promise<unknown>) {
  const answered = page.waitForResponse((r) => r.request().method() === method && path.test(new URL(r.url()).pathname))
  await action()
  expect((await answered).ok()).toBe(true)
}

/** Picks `option` in the unit combo box labelled `label` (typing, then the option). */
async function chooseUnit(page: Page, label: string, text: string, option: string | RegExp) {
  const field = page.getByRole('combobox', { name: label, exact: true })
  await field.fill(text)
  await page.getByRole('option', { name: option }).click()
  await expect(page.getByRole('listbox', { name: label })).toBeHidden()
}

/** The recipe index's entries. */
const recipeEntries = (page: Page) => page.getByRole('main').getByRole('link', { name: /Porridge|porridge/ })

/** Adds a line of `ingredient` to the recipe being edited. */
async function addLine(page: Page, ingredient: string, nth = 0) {
  await page.getByRole('button', { name: 'Add a line' }).nth(nth).click()
  // "Add an ingredient", or "Add to “Section”" once the recipe has sections
  const sheet = page.getByRole('dialog', { name: /^Add/ })
  await sheet.getByRole('button', { name: new RegExp(`^${ingredient}\\b`) }).click()
  await expect(sheet).toBeHidden()
}

/** Opens a recipe's spread from the recipe index. */
async function openRecipe(page: Page, name: string) {
  await openPage(page, 'The recipe index')
  await page.getByRole('main').getByRole('link', { name: new RegExp(`^${name}\\b`) }).click()
  await expect(title(page)).toHaveText(name)
}

/** Opens a recipe's spread for editing. */
async function editRecipe(page: Page, name: string) {
  await page.getByRole('button', { name: `Edit ${name}` }).click()
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()
}

test('log in, build a catalogue and a recipe, compose a week, map a source and import a recipe', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(title(page)).toHaveText('This week’s brief')

  // Settings: the preferred units start at the defaults, and a change is
  // saved, not just shown. It ends as it started: the Oats ingredient below
  // starts in the preferred mass unit and is expected in g.
  await openPage(page, 'Settings')
  const mass = page.getByRole('combobox', { name: 'Mass' })
  await expect(mass).toHaveValue('g')
  await expect(page.getByRole('combobox', { name: 'Volume' })).toHaveValue('dl')
  await expect(page.getByRole('combobox', { name: 'Energy' })).toHaveValue('kcal')
  await sent(page, 'PUT', /^\/api\/preferences$/, () => mass.selectOption('kg'))
  await page.reload()
  await expect(mass).toHaveValue('kg')
  await sent(page, 'PUT', /^\/api\/preferences$/, () => mass.selectOption('g'))
  await page.reload()
  await expect(mass).toHaveValue('g')

  // Data sources lists the fixture's fake source (the server is started with
  // DATA_SOURCES_DIR=tests/data/data_sources). Its page shows the attribution
  // and columns, and a colour that is saved, not just shown.
  const sourceLink = page.getByRole('link', { name: /^TEST Source/ })
  await expect(sourceLink).toHaveText(/TEST Source\s*Version 2026-01-01 · 3 foods/)
  await sourceLink.click()
  await expect(title(page)).toHaveText('TEST Source')
  await expect(page.getByText('TEST data, not real: for tests only.')).toBeVisible()
  const columns = page.getByRole('region', { name: 'Columns' }).getByRole('listitem')
  await expect(columns).toHaveText([/TEST Energy/, /TEST Protein/, /TEST Vitamin D/])
  await page.getByRole('searchbox', { name: 'Search columns' }).fill('vit')
  await expect(columns).toHaveText([/TEST Vitamin D/])
  await sent(page, 'PATCH', /^\/api\/data-sources\/testsource$/, () => page.getByLabel('Colour').fill('#ff0000'))
  await page.reload()
  await expect(page.getByLabel('Colour')).toHaveValue('#ff0000')
  await page.getByRole('link', { name: 'Back to Settings' }).click()
  await expect(title(page)).toHaveText('Settings')

  await openPage(page, 'Attributes')
  await page.getByRole('button', { name: '+ New attribute' }).click()
  const attributeForm = page.getByRole('form', { name: 'New attribute' })
  await attributeForm.getByRole('textbox', { name: 'Name' }).fill('Energy')
  // The unit list: mass, volume and energy, not the piece unit; a chosen
  // unit is stored in its catalogue spelling.
  await attributeForm.getByRole('combobox', { name: 'Unit' }).click()
  const unitList = page.getByRole('listbox', { name: 'Unit' })
  for (const group of ['Mass', 'Volume', 'Energy']) await expect(unitList.getByText(group, { exact: true })).toBeVisible()
  await expect(unitList.getByRole('option', { name: 'st (piece)' })).toHaveCount(0)
  await unitList.getByRole('option', { name: 'kcal (kilocalorie)' }).click()
  await expect(page.getByText("The amount per the ingredient's basis, e.g. g or kcal.")).toBeVisible()
  await attributeForm.getByRole('textbox', { name: 'Decimals' }).fill('0')
  await attributeForm.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('button', { name: /^Energy/ })).toHaveText(/Energy\s*kcal/)

  await openPage(page, 'Tags')
  await page.getByRole('button', { name: '+ New tag' }).click()
  await page.getByRole('textbox', { name: 'Name' }).fill('vegan')
  await page.getByRole('button', { name: 'Done' }).click()
  // The source's food groups are tags too, after the ones made by hand, in
  // the source's colour, without Delete or a Name field.
  const tagRows = page.getByRole('list', { name: 'Tags' }).getByRole('listitem')
  await expect(tagRows).toHaveText([/^vegan.*added by hand/, /^TEST Grains.*TEST Source/, /^TEST Dairy.*TEST Source/])
  await page.getByRole('button', { name: /^TEST Dairy/ }).click()
  await expect(page.getByText("From TEST Source. It can't be renamed or deleted.")).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Done' }).click()

  await openPage(page, 'Ingredients')
  await expect(page.getByText('No ingredients yet.')).toBeVisible()
  await page.getByRole('link', { name: 'New ingredient' }).click()
  await page.getByRole('textbox', { name: 'Name' }).fill('Oats')
  // A new ingredient starts in the preferred mass unit; the list offers
  // pieces but no energy unit.
  const measuredIn = page.getByRole('combobox', { name: 'Measured in' })
  await expect(measuredIn).toHaveValue('g')
  await expect(page.getByRole('textbox', { name: 'Value basis' })).toHaveValue('100')
  await measuredIn.click()
  await expect(page.getByRole('option', { name: 'st (piece)' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'kcal (kilocalorie)' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.getByRole('textbox', { name: 'Energy' }).fill('389')
  await page.getByRole('button', { name: 'vegan' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(title(page)).toHaveText('Ingredients')
  await expect(page.getByRole('link', { name: /^Oats/ })).toHaveText(/Oats.*per 100 g.*Energy 389 kcal/)

  // Saved, not just shown: it reads back after a reload.
  await page.reload()
  await page.getByRole('link', { name: /^Oats/ }).click()
  await expect(page.getByRole('textbox', { name: 'Energy' })).toHaveValue('389')
  await expect(page.getByRole('button', { name: 'vegan' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('link', { name: 'Back to Ingredients' }).click()

  // A recipe of the ingredient: totals per portion as typed, and the tag
  // from the ingredient.
  await openPage(page, 'The recipe index')
  await expect(page.getByText('No recipes yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Add recipe' }).click()
  await page.getByRole('link', { name: /^New recipe/ }).click()
  await expect(title(page)).toHaveText('New recipe')
  await page.getByRole('textbox', { name: 'Name' }).fill('Porridge')
  await addLine(page, 'Oats')
  await page.getByRole('textbox', { name: 'Amount of Oats' }).fill('60')
  const perPortion = page.getByRole('table', { name: 'Per portion' }).getByRole('row')
  await expect(perPortion).toHaveText(['Energy233 kcal'])
  const vegan = page.getByRole('group', { name: 'Tags' }).getByRole('button', { name: /^vegan/ })
  await expect(vegan).toHaveAttribute('aria-pressed', 'true')
  await expect(vegan).toBeDisabled()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(title(page)).toHaveText('Porridge')
  await expect(page.getByRole('table', { name: 'Per portion' }).getByRole('row')).toHaveText(['Energy233 kcal'])
  await openPage(page, 'The recipe index')
  await expect(recipeEntries(page)).toHaveText([/Porridge.*vegan/])

  // The ingredient is now in use: it shows the recipe and can't be deleted.
  await openPage(page, 'Ingredients')
  await page.getByRole('link', { name: /^Oats/ }).click()
  await expect(page.getByText('Used in 1 recipe')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete' })).toBeDisabled()
  await page.getByRole('button', { name: 'Show' }).click()
  await page.getByRole('link', { name: 'Porridge' }).click()
  await expect(title(page)).toHaveText('Porridge')
  await page.goBack()

  // Changing the unit converts what is stored in it, after a question: Cancel
  // changes nothing, Convert changes the unit, the basis and the recipe's
  // amount together, so the recipe's total stays the same.
  await chooseUnit(page, 'Measured in', 'kg', 'kg (kilogram)')
  await page.getByRole('button', { name: 'Save' }).click()
  const question = page.getByRole('alertdialog')
  await expect(question).toContainText('Oats: the basis and 1 recipe amount will be converted from g to kg (× 0.001).')
  await question.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('combobox', { name: 'Measured in' })).toHaveValue('kg')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Convert' }).click()
  await expect(title(page)).toHaveText('Ingredients')
  await expect(page.getByRole('link', { name: /^Oats/ })).toHaveText(/per 0\.1 kg.*Energy 389 kcal/)
  await openRecipe(page, 'Porridge')
  await expect(page.getByRole('table', { name: 'Per portion' }).getByRole('row')).toHaveText(['Energy233 kcal'])
  await editRecipe(page, 'Porridge')
  await expect(page.getByRole('textbox', { name: 'Amount of Oats' })).toHaveValue('0.06')

  // Servings, a method and a source link: Serves 2 halves the per-portion
  // total (the amount is read in kg, as the unit change left it), and all
  // three are saved, not just shown.
  const amounts = page.getByRole('textbox', { name: 'Amount of Oats' })
  await page.getByRole('textbox', { name: 'Serves' }).fill('2')
  await expect(perPortion).toHaveText(['Energy117 kcal'])
  await page.getByRole('textbox', { name: 'Instructions' }).fill('Simmer the oats.')
  await page.getByRole('textbox', { name: 'Source' }).fill('https://example.com/porridge')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: 'Edit Porridge' })).toBeVisible()
  await page.reload()
  await expect(perPortion).toHaveText(['Energy117 kcal'])
  await expect(page.getByRole('region', { name: 'Method' })).toContainText('Simmer the oats.')
  await expect(page.getByRole('link', { name: /^example\.com\/porridge/ })).toHaveAttribute('href', 'https://example.com/porridge')
  await editRecipe(page, 'Porridge')
  await expect(page.getByRole('textbox', { name: 'Serves' })).toHaveValue('2')

  // Sections: adding one names both; the same ingredient goes on a second
  // line in Topping, and the total follows.
  await expect(page.getByRole('textbox', { name: /^Name of section/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Add a section' }).click()
  await page.getByRole('textbox', { name: 'Name of section 1' }).fill('Porridge')
  await page.getByRole('textbox', { name: 'Name of section 2' }).fill('Topping')
  await page.getByRole('button', { name: 'Add a line to “Topping”' }).click()
  await page.getByRole('dialog', { name: 'Add to “Topping”' }).getByRole('button', { name: /^Oats\b/ }).click()
  await expect(amounts.nth(1)).toBeFocused()
  await amounts.nth(1).fill('0.01')
  await expect(amounts.nth(1)).toHaveValue('0.01')
  await expect(perPortion).toHaveText(['Energy136 kcal'])
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: 'Edit Porridge' })).toBeVisible()
  await page.reload()
  await expect(perPortion).toHaveText(['Energy136 kcal'])
  await editRecipe(page, 'Porridge')
  await expect(page.getByRole('textbox', { name: 'Name of section 2' })).toHaveValue('Topping')
  await expect(amounts).toHaveCount(2)
  await expect(amounts.nth(1)).toHaveValue('0.01')

  // Two lines of one recipe are one recipe for the ingredient.
  await page.getByRole('button', { name: 'Cancel' }).click()
  await openPage(page, 'Ingredients')
  await page.getByRole('link', { name: /^Oats/ }).click()
  await expect(page.getByText('Used in 1 recipe')).toBeVisible()

  // Back to one portion in one section, as the steps below expect: removing
  // Topping moves its line up, which is then removed.
  await openRecipe(page, 'Porridge')
  await editRecipe(page, 'Porridge')
  await page.getByRole('group', { name: 'Topping' }).getByRole('button', { name: /Remove this section/ }).click()
  await expect(amounts).toHaveCount(2)
  await page.getByRole('button', { name: 'Remove Oats' }).nth(1).click()
  await page.getByRole('textbox', { name: 'Serves' }).fill('1')
  await page.getByRole('textbox', { name: 'Instructions' }).fill('')
  await page.getByRole('textbox', { name: 'Source' }).fill('')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: 'Edit Porridge' })).toBeVisible()
  await expect(perPortion).toHaveText(['Energy233 kcal'])

  // Conversions and line units. Oats is in kg now (the unit change above): "1 dl
  // = 0.04 kg" is added on its page, and a second one for dl is refused. A
  // second Oats line in Porridge is in dl, which the unit list offers beside
  // other units, and the total is the same as 100 g.
  await openPage(page, 'Ingredients')
  await page.getByRole('link', { name: /^Oats/ }).click()
  const conversionsRegion = page.getByRole('region', { name: 'Conversions' })
  await expect(conversionsRegion).toContainText('No conversions yet.')
  const conversionSheet = page.getByRole('dialog', { name: 'New unit' })
  for (const attempt of [1, 2]) {
    await page.getByRole('button', { name: '+ Add conversion' }).click()
    await conversionSheet.getByRole('combobox', { name: 'Unit' }).fill('dl')
    await conversionSheet.getByRole('textbox', { name: 'How many kg one makes' }).fill('0.04')
    await expect(conversionSheet).toContainText('1 dl of Oats makes 0.04 kg.')
    await conversionSheet.getByRole('button', { name: 'Save' }).click()
    if (attempt === 1) await expect(conversionSheet).toBeHidden()
  }
  await expect(conversionSheet).toContainText('This ingredient has a conversion for that unit already.')
  await conversionSheet.getByRole('button', { name: 'Cancel' }).click()
  await expect(conversionsRegion).toContainText('1 dl = 0.04 kg')

  await openRecipe(page, 'Porridge')
  await editRecipe(page, 'Porridge')
  await addLine(page, 'Oats')
  await expect(amounts.nth(1)).toBeFocused()
  await amounts.nth(1).fill('1')
  const secondUnit = page.getByRole('combobox', { name: 'Unit of Oats' }).nth(1)
  await expect(secondUnit.getByRole('option', { name: 'oz (ounce)' })).toBeAttached()
  await expect(secondUnit.getByRole('option', { name: 'msk (tablespoon)' })).toBeAttached()
  await secondUnit.selectOption({ label: 'dl = 0.04 kg' })
  await expect(perPortion).toHaveText(['Energy389 kcal'])
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: 'Edit Porridge' })).toBeVisible()
  await expect(perPortion).toHaveText(['Energy389 kcal'])

  // The conversion is used now: it says so and can't be deleted. A change of
  // category is refused while it and the dl line exist, the form staying
  // open; kg to g converts the own-unit line and the conversion, and leaves
  // the dl line as written.
  await openPage(page, 'Ingredients')
  await page.getByRole('link', { name: /^Oats/ }).click()
  await expect(conversionsRegion).toContainText('Used in 1 recipe')
  await expect(page.getByRole('button', { name: 'Delete the conversion for dl' })).toBeDisabled()
  await chooseUnit(page, 'Measured in', 'st', 'st (piece)')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/Oats has 1 conversion and 1 recipe line in another unit/)).toBeVisible()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await chooseUnit(page, 'Measured in', 'g', 'g (gram)')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('alertdialog')).toContainText(
    'Oats: the basis, 1 recipe amount and 1 conversion will be converted from kg to g (× 1000).',
  )
  await page.getByRole('alertdialog').getByRole('button', { name: 'Convert' }).click()
  await expect(page.getByRole('link', { name: /^Oats/ })).toHaveText(/per 100 g.*Energy 389 kcal/)
  await page.getByRole('link', { name: /^Oats/ }).click()
  await expect(conversionsRegion).toContainText('1 dl = 40 g')

  // Porridge reads as before in total: 60 g, then 1 dl as written. Taking the
  // dl line out frees the conversion, which is then deleted.
  await openRecipe(page, 'Porridge')
  await editRecipe(page, 'Porridge')
  await expect(amounts.nth(0)).toHaveValue('60')
  await expect(amounts.nth(1)).toHaveValue('1')
  await expect(secondUnit).toHaveValue(/dl/)
  await expect(perPortion).toHaveText(['Energy389 kcal'])
  await page.getByRole('button', { name: 'Remove Oats' }).nth(1).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: 'Edit Porridge' })).toBeVisible()
  await expect(perPortion).toHaveText(['Energy233 kcal'])
  await openPage(page, 'Ingredients')
  await page.getByRole('link', { name: /^Oats/ }).click()
  await page.getByRole('button', { name: 'Delete the conversion for dl' }).click()
  await page.getByRole('alertdialog', { name: 'Delete the conversion for dl?' }).getByRole('button', { name: 'Delete' }).click()
  await expect(conversionsRegion).toContainText('No conversions yet.')

  // Import from a link, then from pasted text (the server runs with
  // AI_PROVIDER=fake, which needs no key). The catalogue holds Oats only (no
  // Milk, no honey).
  await openPage(page, 'The recipe index')
  await page.getByRole('button', { name: 'Add recipe' }).click()
  await expect(page.getByRole('link', { name: /^New recipe/ })).toBeVisible()
  await page.getByRole('link', { name: /^Import recipe/ }).click()
  await expect(title(page)).toHaveText('Import a recipe')
  const importFrom = page.getByRole('group', { name: 'Import from' })
  const link = page.getByRole('textbox', { name: 'Link', exact: true })
  const pasted = page.getByRole('textbox', { name: 'Recipe text' })
  const importButton = page.getByRole('button', { name: 'Import', exact: true })
  // It opens on the link. The e2e server has no internet, so the link is
  // tried only with what the server refuses before any connection: internal
  // addresses and a bad scheme.
  await expect(link).toBeVisible()
  await expect(pasted).toHaveCount(0)
  for (const address of ['http://127.0.0.1:8000/', 'http://169.254.169.254/latest/meta-data/']) {
    await link.fill(address)
    await importButton.click()
    await expect(page.getByRole('alert')).toHaveText("Couldn't read this page. Paste the recipe text instead.")
    await expect(link).toHaveValue(address)
  }
  await link.fill('ftp://example.com/x')
  await importButton.click()
  await expect(page.getByRole('alert')).toHaveText('Enter a link that starts with http:// or https://.')
  // Pasted text: the box starts empty, and the link is kept when turning back.
  await importFrom.getByRole('button', { name: 'Pasted text' }).click()
  await expect(pasted).toHaveValue('')
  await expect(link).toHaveCount(0)
  await importFrom.getByRole('button', { name: 'A link' }).click()
  await expect(link).toHaveValue('ftp://example.com/x')
  await importFrom.getByRole('button', { name: 'Pasted text' }).click()
  await pasted.fill('[fake:none]')
  await importButton.click()
  await expect(page.getByRole('alert')).toHaveText('No recipe found in this text.')
  await expect(pasted).toHaveValue('[fake:none]')
  await pasted.fill('[fake:broken]')
  await importButton.click()
  await expect(page.getByRole('alert')).toHaveText("The AI service didn't answer. Try again.")
  const porridgeText = 'Porridge for two: 100 g oats, 3 dl milk, 2 tbsp honey. Boil.'
  await pasted.fill(porridgeText)
  // A slow answer: while it waits the button says so, inside its own box (at
  // phone width).
  await page.route(
    '**/api/recipe-imports',
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.continue()
    },
    { times: 1 },
  )
  await importButton.click()
  const reading = page.getByRole('button', { name: /Reading the recipe/ })
  await expect(reading).toBeVisible()
  expect(await reading.evaluate((button) => button.scrollWidth <= button.clientWidth + 1)).toBe(true)

  // The draft opens unsaved, in review: the banner counts the two lines that
  // need the owner, each line shows its source line, the pepper line is left
  // out, and the banner says what saving waits for.
  await expect(title(page)).toHaveText('New recipe')
  await expect(page.getByText('Reviewing an imported recipe')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Imported porridge')
  await expect(page.getByRole('textbox', { name: /^Serves/ })).toHaveValue('2')
  await expect(page.getByRole('textbox', { name: 'Instructions' })).toHaveValue('Boil the oats in the milk.\nStir in the honey.')
  await expect(page.getByText('Imported from pasted text. 2 lines need you.')).toBeVisible()
  const lines = page.getByRole('region', { name: 'Ingredients' }).getByRole('listitem')
  await expect(lines).toHaveCount(4)
  for (const [index, source] of ['100 g oats', '3 dl milk', '2 tbsp honey', 'salt and pepper to taste'].entries()) {
    await expect(lines.nth(index)).toContainText(`From the text: ${source}`)
  }
  await expect(lines.nth(3)).toContainText('Not an ingredient, so left out')
  const save = page.getByRole('button', { name: 'Save' })
  await expect(page.getByText('Match, convert or skip every line to save.')).toBeVisible()

  // Milk is made on the spot: Pick ingredient searches "milk", + New
  // ingredient opens the form with the name filled in. The line then asks the
  // AI for a factor: 1 dl = [50] g, marked as suggested.
  await lines.nth(1).getByRole('button', { name: 'Pick ingredient: milk' }).click()
  const match = page.getByRole('dialog', { name: 'Match “milk”' })
  await expect(match.getByRole('searchbox')).toHaveValue('milk')
  await match.getByRole('button', { name: '+ New ingredient' }).click()
  const newIngredient = page.getByRole('dialog', { name: 'New ingredient' })
  await expect(newIngredient.getByRole('textbox', { name: 'Name' })).toHaveValue('Milk')
  await newIngredient.getByRole('textbox', { name: 'Energy' }).fill('42')
  await newIngredient.getByRole('button', { name: 'Save' }).click()
  await expect(newIngredient).toBeHidden()
  await expect(lines.nth(1).getByRole('textbox', { name: /^How many g/ })).toHaveValue('50')
  await expect(lines.nth(1).getByRole('img', { name: 'Suggested by AI, not checked by you' })).toBeVisible()
  await lines.nth(1).getByRole('button', { name: 'Accept: Milk' }).click()
  await expect(page.getByText('Imported from pasted text. 1 line needs you.')).toBeVisible()

  // Honey is skipped, so every line is ready: Save is enabled and makes the
  // recipe, whose per portion total is
  // (100 g oats x 389 + 3 dl x 50 g milk x 42) / 100 / 2 servings = 226.
  await lines.nth(2).getByRole('button', { name: 'Skip: honey' }).click()
  await expect(page.getByText('Imported from pasted text. All lines are ready.')).toBeVisible()
  await expect(page.getByText('Match, convert or skip every line to save.')).toHaveCount(0)
  await save.click()
  await expect(title(page)).toHaveText('Imported porridge')
  await expect(perPortion).toHaveText(['Energy226 kcal'])

  // The review's conversion was saved with the recipe, marked as the AI's,
  // and is in use. Editing its number saves it as the owner's (no mark) and
  // the recipe's total follows: (389 + 3 x 55 x 0.42) / 2 = 229.
  await openPage(page, 'Ingredients')
  await page.getByRole('link', { name: /^Milk/ }).click()
  await expect(conversionsRegion).toContainText('1 dl = 50 g')
  await expect(conversionsRegion).toContainText('Suggested by AI, not checked by you')
  await expect(conversionsRegion).toContainText('Used in 1 recipe')
  await page.getByRole('button', { name: 'Edit the conversion for dl' }).click()
  const editConversion = page.getByRole('dialog', { name: 'Edit conversion' })
  await editConversion.getByRole('textbox', { name: 'How many g one makes' }).fill('55')
  await editConversion.getByRole('button', { name: 'Save' }).click()
  await expect(conversionsRegion).toContainText('1 dl = 55 g')
  await expect(conversionsRegion).not.toContainText('Suggested by AI')
  await openRecipe(page, 'Imported porridge')
  await expect(perPortion).toHaveText(['Energy229 kcal'])

  // Clean up so the steps after this are unchanged: the imported recipe,
  // Milk's conversion and Milk are deleted; Porridge is the only recipe again.
  await editRecipe(page, 'Imported porridge')
  await page.getByRole('button', { name: 'Delete this recipe' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(title(page)).toHaveText('The recipe index')
  await expect(recipeEntries(page)).toHaveText([/^Porridge/])
  await openPage(page, 'Ingredients')
  await page.getByRole('link', { name: /^Milk/ }).click()
  await page.getByRole('button', { name: 'Delete the conversion for dl' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(conversionsRegion).toContainText('No conversions yet.')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('alertdialog', { name: 'Delete Milk?' }).getByRole('button', { name: 'Delete' }).click()
  await expect(title(page)).toHaveText('Ingredients')
  await expect(page.getByRole('main').getByRole('link', { name: /per 100 g/ })).toHaveText([/^Oats/])

  // Leaving an unsaved import asks first: Keep editing stays, Discard leaves
  // with nothing saved.
  await openPage(page, 'The recipe index')
  await page.getByRole('button', { name: 'Add recipe' }).click()
  await page.getByRole('link', { name: /^Import recipe/ }).click()
  await page.getByRole('group', { name: 'Import from' }).getByRole('button', { name: 'Pasted text' }).click()
  await page.getByRole('textbox', { name: 'Recipe text' }).fill(porridgeText)
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(page.getByText('Reviewing an imported recipe')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  const discard = page.getByRole('alertdialog', { name: 'Discard this recipe?' })
  await discard.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page.getByText('Imported from pasted text. 2 lines need you.')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await discard.getByRole('button', { name: 'Discard' }).click()
  await expect(title(page)).toHaveText('The recipe index')
  await expect(recipeEntries(page)).toHaveText([/^Porridge/])

  // The tag is no longer "added by hand", and deleting the attribute warns
  // about the ingredient value.
  await openPage(page, 'Tags')
  await expect(page.getByRole('button', { name: /^vegan/ })).not.toContainText('added by hand')
  await openPage(page, 'Attributes')
  await page.getByRole('button', { name: /^Energy/ }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('This also removes its values from 1 ingredient')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click()

  // Compose a week. The schedule: two days, changed in its sheet from the
  // brief.
  await openPage(page, 'This week’s brief')
  const schedule = page.getByRole('region', { name: 'The schedule' })
  await schedule.getByRole('button', { name: 'Change the schedule' }).click()
  const scheduleSheet = page.getByRole('dialog', { name: 'The schedule' })
  const days = scheduleSheet.getByRole('group', { name: 'Number of days' })
  while ((await days.getByRole('status').textContent()) !== '2') await days.getByRole('button', { name: 'Fewer days' }).click()
  await scheduleSheet.getByRole('button', { name: 'Done' }).click()
  await expect(scheduleSheet).toBeHidden()
  await expect(schedule.getByRole('button', { name: /Set how many meals must be served/ })).toHaveCount(2)

  // A goal: at least 100 kcal of Energy each day, a must. The goals section
  // shows it as a sentence.
  const goals = page.getByRole('region', { name: 'The goals' })
  await goals.getByRole('button', { name: 'Add goal' }).click()
  const goalSheet = page.getByRole('dialog', { name: 'Add goal' })
  await expect(goalSheet.getByRole('group', { name: 'What to track' }).getByRole('button', { name: 'Energy' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await goalSheet.getByRole('textbox', { name: 'Min (kcal)' }).fill('100')
  await goalSheet.getByRole('button', { name: 'Each day' }).click()
  await goalSheet.getByRole('button', { name: 'Must', exact: true }).click()
  await goalSheet.getByRole('button', { name: 'Add goal' }).click()
  await expect(goalSheet).toBeHidden()
  await expect(goals.getByRole('listitem')).toHaveText([/Must.*At least 100 kcal energy, each day/])

  // Its name, typed under Advanced, names the goal.
  await goals.getByRole('listitem').getByRole('button').first().click()
  const editGoal = page.getByRole('dialog', { name: 'Edit goal' })
  await editGoal.getByText('Advanced').click()
  await editGoal.getByRole('textbox', { name: 'Goal name' }).fill('Energy floor')
  await editGoal.getByRole('button', { name: 'Done' }).click()
  await expect(editGoal).toBeHidden()
  await expect(goals.getByRole('listitem')).toHaveText([/Energy floor/])

  // Recipe filters: the sheet counts the recipes the filters leave. Never
  // vegan leaves none, Only vegan leaves the one; the brief shows the filter.
  const filters = page.getByRole('region', { name: 'Recipe filters' })
  await expect(filters).toContainText('1 of 1 recipe can be used')
  await filters.getByRole('button', { name: 'Change the recipe filters' }).click()
  const filterSheet = page.getByRole('dialog', { name: 'Recipe filters' })
  const veganFilter = filterSheet.getByRole('group', { name: 'Filter for vegan' })
  await veganFilter.getByRole('button', { name: 'Never' }).click()
  await expect(filterSheet).toContainText('No recipe fits these filters.')
  await veganFilter.getByRole('button', { name: 'Only' }).click()
  await expect(filterSheet).toContainText('1 of 1 recipe can be used')
  await filterSheet.getByRole('button', { name: 'Done' }).click()
  await expect(filterSheet).toBeHidden()
  await expect(filters).toContainText('Only: vegan')
  await expect(filters).toContainText('1 of 1 recipe can be used')

  // Compose: the week opens on The Menu with the recipe in every meal, and is
  // filed in the archive, which returns to the brief.
  await page.getByRole('button', { name: 'Compose the week' }).click()
  const menu = page.getByRole('article', { name: 'The Menu' })
  await expect(menu).toBeVisible({ timeout: 60_000 })
  await expect(menu).toContainText('Best possible plan')
  await expect(menu.getByRole('link', { name: /^Porridge/ })).toHaveCount(6)
  // the colophon, after the menu
  const main = page.getByRole('main')
  await expect(main).toContainText('Every goal was met.')
  await main.getByRole('button', { name: 'Save to the archive' }).click()
  await expect(page.getByText('Saved to the archive.')).toBeVisible()
  await expect(title(page)).toHaveText('This week’s brief')
  await openPage(page, 'The archive')
  await expect(page.getByRole('list', { name: 'Saved plans' }).getByRole('link')).toHaveText([/2 days\. Saved .*Today/])

  // A Must goal no meal can meet: at most 10 kcal each day. No plan is
  // possible; the Editor's note names the goal. Made Prefer, Try again
  // composes the plan.
  await openPage(page, 'This week’s brief')
  await goals.getByRole('button', { name: 'Add goal' }).click()
  await goalSheet.getByRole('textbox', { name: 'Max (kcal)' }).fill('10')
  await goalSheet.getByRole('button', { name: 'Each day' }).click()
  await goalSheet.getByRole('button', { name: 'Must', exact: true }).click()
  await goalSheet.getByRole('button', { name: 'Add goal' }).click()
  await expect(goalSheet).toBeHidden()
  await page.getByRole('button', { name: 'Compose the week' }).click()
  const note = page.getByRole('article', { name: 'No plan possible' })
  await expect(note).toBeVisible({ timeout: 60_000 })
  await expect(note).toContainText('Editor’s note')
  const clashing = note.getByRole('list', { name: 'The rules that clash' }).getByRole('listitem').filter({ hasText: 'Energy per day' })
  await expect(clashing).toContainText(/Clashes on \w{3} \d+/)
  await expect(clashing.getByRole('textbox', { name: 'Max' })).toHaveValue('10')
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  await clashing.getByRole('button', { name: 'Make Prefer' }).click()
  await expect(clashing).toContainText('Will be Prefer')
  await note.getByRole('button', { name: 'Try again' }).click()
  await expect(menu).toBeVisible({ timeout: 60_000 })
  await expect(menu).toContainText('Best possible plan')
  await openPage(page, 'This week’s brief')
  await expect(goals.getByRole('listitem').nth(1)).toContainText(/at most 10 kcal/i)
  await expect(goals.getByRole('listitem').nth(1)).toContainText(/prefer/i)

  // Column mapping: the source page's Attribute choices. TEST Energy (kcal)
  // is offered Energy only, and the choice is saved, not just shown. TEST
  // Protein (g) gets a new attribute made on the spot, which then shows as
  // taken in the other columns' lists. Settings counts the mapped columns.
  await openPage(page, 'Settings')
  await page.getByRole('link', { name: /^TEST Source/ }).click()
  const attributeFor = (column: string) => page.getByRole('combobox', { name: `Attribute for ${column}` })
  const chosen = (column: string) => attributeFor(column).locator('option:checked')
  await expect(attributeFor('TEST Energy').getByRole('option')).toHaveText(['Not mapped', 'Energy', 'Create attribute…'])
  await sent(page, 'PUT', /\/columns\//, () => attributeFor('TEST Energy').selectOption({ label: 'Energy' }))
  await page.reload()
  await expect(chosen('TEST Energy')).toHaveText('Energy')

  const createAttribute = async () => {
    await attributeFor('TEST Protein').selectOption({ label: 'Create attribute…' })
    const sheet = page.getByRole('dialog', { name: 'New attribute' })
    await expect(sheet.getByRole('textbox', { name: 'Name' })).toHaveValue('')
    await expect(sheet.getByRole('combobox', { name: 'Unit' })).toHaveValue('g')
    await sheet.getByRole('textbox', { name: 'Name' }).fill('Protein')
    await sheet.getByRole('textbox', { name: 'Decimals' }).fill('1')
    await sheet.getByRole('button', { name: 'Add' }).click()
    await expect(sheet).toBeHidden()
    await expect(chosen('TEST Protein')).toHaveText('Protein')
  }
  await createAttribute()
  await page.reload()
  await expect(chosen('TEST Protein')).toHaveText('Protein')
  const taken = attributeFor('TEST Vitamin D').getByRole('option', { name: /^Protein/ })
  await expect(taken).toHaveText('Protein (taken by TEST Protein)')
  await expect(taken).toBeDisabled()
  await page.getByRole('link', { name: 'Back to Settings' }).click()
  await expect(page.getByRole('link', { name: /^TEST Source/ })).toContainText('2 of 3 columns mapped')

  // An attribute's unit can't change while a column that converts only in
  // the old one is mapped to it; deleting an attribute clears its mapping,
  // after a warning that counts it.
  await openPage(page, 'Attributes')
  await page.getByRole('button', { name: /^Energy/ }).click()
  await chooseUnit(page, 'Unit', 'g', 'g (gram)')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText(/mapped from TEST Energy \(TEST Source\), which is in kcal/)).toBeVisible()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await chooseUnit(page, 'Unit', 'kcal', 'kcal (kilocalorie)')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('button', { name: /^Energy/ })).toHaveText(/Energy\s*kcal/)
  await page.getByRole('button', { name: /^Protein/ }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  const deleteProtein = page.getByRole('alertdialog')
  await expect(deleteProtein).toContainText('Its mapping from 1 source column is cleared.')
  await expect(deleteProtein).not.toContainText('removes')
  await deleteProtein.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('button', { name: /^Protein/ })).toHaveCount(0)
  await openPage(page, 'Settings')
  await expect(page.getByRole('link', { name: /^TEST Source/ })).toContainText('1 of 3 columns mapped')
  await page.getByRole('link', { name: /^TEST Source/ }).click()
  await expect(chosen('TEST Protein')).toHaveText('Not mapped')
  await expect(chosen('TEST Energy')).toHaveText('Energy')

  // Add from data source: TEST Oats is searched, previewed (only Energy is
  // mapped now, in kcal) and added under another name. Its page names the
  // source and offers mass units only, and refuses a volume unit. A second
  // look at the food warns about the ingredient made from it. Unlink removes
  // the source, and keeps the values.
  const fromSource = page.getByRole('dialog', { name: 'Add from data source' })
  const addFromSource = async () => {
    await openPage(page, 'Ingredients')
    await page.getByRole('button', { name: 'Add an ingredient' }).click()
    await page.getByRole('button', { name: 'Add from data source' }).click()
    await expect(fromSource.getByRole('combobox', { name: 'Data source' })).toHaveValue('testsource')
  }
  await addFromSource()
  const foods = fromSource.getByRole('button', { name: /^TEST (Cheese|Milk|Oats)/ })
  await expect(foods).toHaveText([/TEST Cheese.*TEST Dairy/, /TEST Milk.*TEST Dairy/, /TEST Oats.*TEST Grains/])
  await fromSource.getByRole('searchbox', { name: 'Search foods' }).fill('oat')
  await expect(foods).toHaveCount(1)
  await foods.click()
  await expect(fromSource.getByRole('textbox', { name: 'Name' })).toHaveValue('TEST Oats')
  await expect(fromSource).toContainText('Measured in g, values per 100 g')
  await expect(fromSource).toContainText('Energy389 kcal')
  await expect(fromSource.getByRole('group', { name: 'Tags' }).getByRole('button', { name: 'TEST Grains' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await fromSource.getByRole('textbox', { name: 'Name' }).fill('Source oats')
  await fromSource.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(fromSource).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Source oats')
  await expect(page.getByText('From TEST Source: TEST Oats')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Measured in' })).toHaveValue('g')
  await expect(page.getByRole('textbox', { name: 'Energy' })).toHaveValue('389')
  await expect(page.getByRole('group', { name: 'Tags' }).getByRole('button', { name: 'TEST Grains' })).toHaveAttribute('aria-pressed', 'true')
  const unitGroups = async () => {
    await page.getByRole('combobox', { name: 'Measured in' }).click()
    const groups = page.getByRole('listbox', { name: 'Measured in' }).getByRole('group')
    await expect(groups.first()).toBeVisible()
    const count = await groups.count()
    await page.keyboard.press('Escape')
    return count
  }
  expect(await unitGroups()).toBe(1) // a linked ingredient lists mass units only
  await page.getByRole('combobox', { name: 'Measured in' }).fill('dl')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/can only be measured in a mass unit/)).toBeVisible()
  await page.reload()
  await expect(page.getByText('From TEST Source: TEST Oats')).toBeVisible()

  await addFromSource()
  await fromSource.getByRole('searchbox', { name: 'Search foods' }).fill('oat')
  await expect(foods).toHaveCount(1)
  await foods.click()
  await expect(fromSource).toContainText('You already have an ingredient from this food: Source oats')
  await fromSource.getByRole('button', { name: 'Close' }).click()
  await expect(fromSource).toBeHidden()

  await page.getByRole('link', { name: /^Source oats/ }).click()
  await page.getByRole('button', { name: 'Unlink from source' }).click()
  await page.getByRole('alertdialog', { name: 'Unlink Source oats from TEST Source?' }).getByRole('button', { name: 'Unlink', exact: true }).click()
  await expect(page.getByText('From TEST Source: TEST Oats')).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Energy' })).toHaveValue('389')
  expect(await unitGroups()).toBe(3)
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Source oats')
  await expect(page.getByText('From TEST Source: TEST Oats')).toHaveCount(0)

  // Updated values: two ingredients from TEST Oats have no note. Mapping TEST
  // Protein afterwards (a new attribute, made from the column) gives them a
  // value they never had: the list marks them and filters them. Accept
  // copies the number, Keep mine keeps the ingredient without it, as an
  // explicit 0; neither note returns.
  const updatedNote = page.getByRole('status', { name: 'Updated values available' })
  for (const name of ['Linked A', 'Linked B']) {
    await addFromSource()
    await fromSource.getByRole('searchbox', { name: 'Search foods' }).fill('oat')
    await expect(foods).toHaveCount(1)
    await foods.click()
    await fromSource.getByRole('textbox', { name: 'Name' }).fill(name)
    await fromSource.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(name)
    await expect(page.getByText('From TEST Source: TEST Oats')).toBeVisible()
    await expect(updatedNote).toHaveCount(0)
  }
  await openPage(page, 'Settings')
  await page.getByRole('link', { name: /^TEST Source/ }).click()
  await createAttribute()

  await openPage(page, 'Ingredients')
  const entry = (name: string) => page.getByRole('main').getByRole('link', { name: new RegExp(`^${name}`) })
  await expect(entry('Linked A')).toContainText('Updated values available')
  await expect(entry('Linked B')).toContainText('Updated values available')
  await expect(page.getByRole('main').getByText('Updated values available')).toHaveCount(2)
  const onlyUpdated = page.getByRole('button', { name: 'Only with updated values (2)' })
  await onlyUpdated.click()
  await expect(page.getByRole('main').getByRole('link', { name: /per 100 g/ })).toHaveText([/^Linked A/, /^Linked B/])
  await onlyUpdated.click()

  await entry('Linked A').click()
  await expect(updatedNote).toContainText('Protein none → 13.5 g')
  await updatedNote.getByRole('button', { name: 'Accept' }).click()
  await expect(updatedNote).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Protein' })).toHaveValue('13.5')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(title(page)).toHaveText('Ingredients')
  await expect(entry('Linked A')).toContainText('Protein 13.5 g')
  await expect(entry('Linked A')).not.toContainText('Updated values available')

  await entry('Linked B').click()
  await updatedNote.getByRole('button', { name: 'Keep mine' }).click()
  await expect(updatedNote).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Protein' })).toHaveValue('0')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(title(page)).toHaveText('Ingredients')
  await entry('Linked B').click()
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Protein' })).toHaveValue('0')
  await expect(updatedNote).toHaveCount(0)
  await page.getByRole('link', { name: 'Back to Ingredients' }).click()
  await expect(page.getByRole('button', { name: /Only with updated values/ })).toHaveCount(0)
  await expect(page.getByRole('main').getByText('Updated values available')).toHaveCount(0)

  // Equivalent tags: vegan (all) and the source tag TEST Grains (any).
  // Adding it asks to switch its rule; the filters then treat them as one,
  // and removing it undoes that.
  await openPage(page, 'Tags')
  const tagRow = (name: string) => page.getByRole('list', { name: 'Tags' }).getByRole('button', { name: new RegExp(`^${name}`) })
  await tagRow('vegan').click()
  await page.getByRole('button', { name: 'Add equivalent tag' }).click()
  await page.getByRole('dialog', { name: 'Add equivalent tag' }).getByRole('button', { name: /^TEST Grains/ }).click()
  await expect(page.getByRole('region', { name: 'Equivalent tags' })).toContainText('TEST Grains')
  await page.getByRole('button', { name: 'Done' }).click()
  const switchRule = page.getByRole('alertdialog')
  await expect(switchRule).toContainText(
    'TEST Grains gets a recipe tag when any ingredient has it; the group uses all. Switch TEST Grains to all?',
  )
  await switchRule.getByRole('button', { name: 'Switch' }).click()
  await expect(tagRow('vegan')).toContainText('When all ingredients have it · equivalent to TEST Grains')
  await expect(tagRow('TEST Grains')).toContainText('When all ingredients have it · equivalent to vegan')

  // Only vegan is set, so Never TEST Grains contradicts it; a recipe fails
  // that only while the two are one tag.
  const neverGrains = async () => {
    await openPage(page, 'This week’s brief')
    await filters.getByRole('button', { name: 'Change the recipe filters' }).click()
    await filterSheet.getByRole('group', { name: 'Filter for TEST Grains' }).getByRole('button', { name: 'Never' }).click()
  }
  await neverGrains()
  await expect(filterSheet).toContainText('No recipe fits these filters.')
  await filterSheet.getByRole('group', { name: 'Filter for TEST Grains' }).getByRole('button', { name: 'Any' }).click()
  await filterSheet.getByRole('button', { name: 'Done' }).click()
  await expect(filterSheet).toBeHidden()

  await openPage(page, 'Tags')
  await tagRow('TEST Grains').click()
  await page.getByRole('button', { name: 'Remove vegan' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(tagRow('vegan')).not.toContainText('equivalent to')
  await expect(tagRow('TEST Grains')).not.toContainText('equivalent to')
  await neverGrains()
  await expect(filterSheet).toContainText('1 of 1 recipe can be used')

  // Designed at phone width: nothing scrolls sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
})
