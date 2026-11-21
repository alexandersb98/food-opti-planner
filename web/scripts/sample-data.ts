// Fills a LOCAL dev backend with believable sample data, through the public API,
// for screenshot checks: attributes, ingredients (with conversions and tags, one
// added from the test data source), tags with a tag group, recipes with sections
// and instructions, a plan setup with Must and Prefer goals and a recipe filter,
// and one solved, saved plan used for today.
//
// Usage (backend started as in the README, with DATA_SOURCES_DIR=tests/data/data_sources):
//   npm run sample-data
// Settings: PLANNER_API (default http://localhost:8000), PLANNER_PASSWORD (default "sample").
// Refuses any host but localhost, and any database that already has catalogue rows.

const api = new URL(process.env.PLANNER_API ?? 'http://localhost:8000')
const password = process.env.PLANNER_PASSWORD ?? 'sample'
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

if (!LOCAL_HOSTS.has(api.hostname)) {
  console.error(`Refusing to seed ${api.origin}: sample data goes to a local backend only (localhost).`)
  process.exit(1)
}

let cookie = ''

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(new URL(path, api), {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error',
  })
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`)
  const setCookie = response.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]
  return (response.status === 204 ? undefined : await response.json()) as T
}

const post = <T>(path: string, body?: unknown) => call<T>('POST', path, body)
const put = <T>(path: string, body: unknown) => call<T>('PUT', path, body)
const get = <T>(path: string) => call<T>('GET', path)

interface Row { id: number; name: string }
interface Tag extends Row { source: unknown }
interface DataSource { key: string; columns: { id: number; key: string }[] }
interface Food { id: number; name: string }

function localDate(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

async function main() {
  await post('/api/login', { password })

  const [attributes, ingredients, recipes, tags] = await Promise.all([
    get<Row[]>('/api/attributes'),
    get<Row[]>('/api/ingredients'),
    get<Row[]>('/api/recipes'),
    get<Tag[]>('/api/tags'),
  ])
  const ownTags = tags.filter((tag) => tag.source === null)
  if (attributes.length || ingredients.length || recipes.length || ownTags.length) {
    console.log(
      'This database already has catalogue rows, so nothing was changed. The sample data goes into an empty ' +
        'database only: stop the backend, delete its SQLite file (planner.db by default) and start it again.',
    )
    return
  }

  // Attributes
  const attribute: Record<string, number> = {}
  for (const [name, unit, decimals] of [
    ['Energy', 'kcal', 0],
    ['Protein', 'g', 1],
    ['Fat', 'g', 1],
    ['Carbohydrate', 'g', 1],
    ['Fibre', 'g', 1],
  ] as const) {
    attribute[name] = (await post<Row>('/api/attributes', { name, unit, decimals })).id
  }

  // Tags: "all" holds when every ingredient has it, "any" when one does.
  const tag: Record<string, number> = {}
  for (const [name, derive] of [
    ['Vegan', 'all'],
    ['Vegetarian', 'all'],
    ['Dairy', 'any'],
    ['Gluten', 'any'],
    ['Fish', 'any'],
    ['Quick', 'any'],
  ] as const) {
    tag[name] = (await post<Row>('/api/tags', { name, derive })).id
  }
  // A tag group: Dairy is the same as the data source's TEST Dairy.
  const sourceDairy = tags.find((t) => t.name === 'TEST Dairy')
  if (sourceDairy) {
    await put(`/api/tags/${tag.Dairy}`, {
      name: 'Dairy', derive: 'any', equivalent_tag_ids: [sourceDairy.id], confirm: true,
    })
  }

  // One ingredient from the data source, after mapping its columns to attributes.
  const ingredient: Record<string, number> = {}
  const source = (await get<DataSource[]>('/api/data-sources')).find((s) => s.key === 'testsource')
  if (source) {
    const detail = await get<DataSource>(`/api/data-sources/${source.key}`)
    for (const column of detail.columns) {
      const mapped = { 'ENERC:kcal': attribute.Energy, PROT: attribute.Protein }[column.key]
      if (mapped) await put(`/api/data-sources/${source.key}/columns/${column.id}`, { attribute_id: mapped })
    }
    const { foods } = await get<{ foods: Food[] }>(`/api/data-sources/${source.key}/foods?search=Oats`)
    const oats = foods.find((food) => food.name === 'TEST Oats')
    const grains = tags.find((t) => t.name === 'TEST Grains')
    if (oats) {
      ingredient['Rolled oats'] = (await post<Row>('/api/ingredients/from-source', {
        food_id: oats.id, name: 'Rolled oats', tag_ids: grains ? [grains.id] : [],
      })).id
    }
  } else {
    console.warn('No "testsource" data source: start the backend with DATA_SOURCES_DIR=tests/data/data_sources.')
  }

  // Ingredients, per 100 g unless said otherwise: [name, unit, basis, energy, protein, fat, carbs, fibre, tags, conversions]
  type Values = [number, number, number, number, number]
  const catalogue: [string, string, number, Values, string[], [string, number][]][] = [
    ['Rolled oats', 'g', 100, [389, 13.5, 6.5, 59, 10], ['Vegan', 'Vegetarian', 'Gluten'], [['dl', 35]]],
    ['Milk', 'g', 100, [64, 3.4, 3, 4.8, 0], ['Vegetarian', 'Dairy'], [['dl', 103]]],
    ['Eggs', 'st', 1, [78, 6.3, 5.3, 0.6, 0], ['Vegetarian'], [['g', 0.017]]],
    ['Wholemeal bread', 'g', 100, [247, 13, 3.4, 41, 7], ['Vegan', 'Vegetarian', 'Gluten'], [['st', 35]]],
    ['Cheddar', 'g', 100, [402, 25, 33, 1.3, 0], ['Vegetarian', 'Dairy'], []],
    ['Chickpeas, cooked', 'g', 100, [164, 8.9, 2.6, 27, 7.6], ['Vegan', 'Vegetarian'], [['dl', 70]]],
    ['Basmati rice', 'g', 100, [360, 7, 0.6, 79, 1.3], ['Vegan', 'Vegetarian'], [['dl', 85]]],
    ['Salmon fillet', 'g', 100, [208, 20, 13, 0, 0], ['Fish'], []],
    ['Chicken breast', 'g', 100, [120, 23, 2.6, 0, 0], [], []],
    ['Crushed tomatoes', 'g', 100, [32, 1.6, 0.3, 5.8, 1.5], ['Vegan', 'Vegetarian'], []],
    ['Baby spinach', 'g', 100, [23, 2.9, 0.4, 3.6, 2.2], ['Vegan', 'Vegetarian'], []],
    ['Olive oil', 'g', 100, [884, 0, 100, 0, 0], ['Vegan', 'Vegetarian'], [['msk', 13.5]]],
    ['Red lentils', 'g', 100, [350, 24, 1.5, 50, 11], ['Vegan', 'Vegetarian'], [['dl', 85]]],
    ['Banana', 'g', 100, [89, 1.1, 0.3, 23, 2.6], ['Vegan', 'Vegetarian'], [['st', 120]]],
    ['Greek yoghurt', 'g', 100, [97, 9, 5, 3.9, 0], ['Vegetarian', 'Dairy'], [['dl', 105]]],
    ['Yellow onion', 'g', 100, [40, 1.1, 0.1, 9.3, 1.7], ['Vegan', 'Vegetarian'], [['st', 110]]],
  ]
  const order = ['Energy', 'Protein', 'Fat', 'Carbohydrate', 'Fibre']
  for (const [name, unit, basis, values, tagNames, conversions] of catalogue) {
    const fields = {
      name, unit, basis: String(basis),
      values: values.map((value, i) => ({ attribute_id: attribute[order[i]], value: String(value) })),
      tag_ids: tagNames.map((t) => tag[t]),
    }
    // The ingredient from the data source keeps its link, values and source tag: only what is missing is added.
    if (ingredient[name]) {
      const linked = await get<{ values: { attribute_id: number; value: string }[]; tag_ids: number[] }>(
        `/api/ingredients/${ingredient[name]}`,
      )
      const own = new Set(linked.values.map((v) => v.attribute_id))
      await put(`/api/ingredients/${ingredient[name]}`, {
        ...fields,
        values: [...linked.values, ...fields.values.filter((v) => !own.has(v.attribute_id))],
        tag_ids: [...new Set([...linked.tag_ids, ...fields.tag_ids])],
      })
    } else {
      ingredient[name] = (await post<Row>('/api/ingredients', fields)).id
    }
    for (const [convUnit, factor] of conversions) {
      await post(`/api/ingredients/${ingredient[name]}/conversions`, { unit: convUnit, factor: String(factor) })
    }
  }

  // Recipes: sections (named when there are several) of [ingredient, amount, unit ('' = the ingredient's own), original text].
  type Line = [string, number, string, string]
  const book: { name: string; servings: number; extra?: string[]; sections: [string, Line[]][]; instructions: string }[] = [
    {
      name: 'Overnight oats with banana', servings: 1, extra: ['Quick'],
      sections: [
        ['Base', [['Rolled oats', 1, 'dl', '1 dl rolled oats'], ['Milk', 1.5, 'dl', '1½ dl milk']]],
        ['Topping', [['Banana', 1, 'st', '1 banana, sliced'], ['Greek yoghurt', 0.5, 'dl', '½ dl Greek yoghurt']]],
      ],
      instructions: 'Stir the oats into the milk in a jar and leave in the fridge overnight.\n\nIn the morning, top with sliced banana and a spoonful of yoghurt.',
    },
    {
      name: 'Scrambled eggs on toast', servings: 1, extra: ['Quick'],
      sections: [
        ['Eggs', [['Eggs', 3, '', '3 eggs'], ['Cheddar', 20, 'g', '20 g cheddar, grated']]],
        ['To serve', [['Wholemeal bread', 2, 'st', '2 slices wholemeal bread']]],
      ],
      instructions: 'Whisk the eggs with a pinch of salt. Cook slowly over low heat, stirring, until just set.\n\nFold in the cheese and spoon onto the toast.',
    },
    {
      name: 'Chickpea and spinach curry', servings: 2,
      sections: [
        ['Curry', [
          ['Yellow onion', 1, 'st', '1 onion, chopped'], ['Olive oil', 1, 'msk', '1 tbsp olive oil'],
          ['Chickpeas, cooked', 4, 'dl', '4 dl cooked chickpeas'], ['Crushed tomatoes', 400, 'g', '1 tin crushed tomatoes'],
          ['Baby spinach', 100, 'g', '100 g baby spinach'],
        ]],
        ['To serve', [['Basmati rice', 2, 'dl', '2 dl basmati rice']]],
      ],
      instructions: 'Soften the onion in the oil. Add the chickpeas and tomatoes and simmer for 15 minutes.\n\nStir in the spinach until it wilts. Serve with the rice.',
    },
    {
      name: 'Salmon with rice and spinach', servings: 1,
      sections: [
        ['Salmon', [['Salmon fillet', 125, 'g', '1 salmon fillet'], ['Olive oil', 0.5, 'msk', '½ tbsp olive oil']]],
        ['Sides', [['Basmati rice', 0.75, 'dl', '¾ dl basmati rice'], ['Baby spinach', 50, 'g', 'a handful of spinach']]],
      ],
      instructions: 'Roast the salmon at 200 °C for 12–15 minutes.\n\nCook the rice, and wilt the spinach in the oil just before serving.',
    },
    {
      name: 'Red lentil soup', servings: 3,
      sections: [
        ['', [
          ['Yellow onion', 1, 'st', '1 onion'], ['Olive oil', 1, 'msk', '1 tbsp olive oil'],
          ['Red lentils', 2, 'dl', '2 dl red lentils'], ['Crushed tomatoes', 400, 'g', '1 tin crushed tomatoes'],
        ]],
      ],
      instructions: 'Soften the onion in the oil, add the lentils, tomatoes and 1 litre of water.\n\nSimmer for 20 minutes and blend until smooth.',
    },
    {
      name: 'Chicken and rice bowl', servings: 1,
      sections: [
        ['Bowl', [['Chicken breast', 150, 'g', '150 g chicken breast'], ['Basmati rice', 0.75, 'dl', '¾ dl rice'], ['Baby spinach', 40, 'g', 'a handful of spinach']]],
        ['Sauce', [['Greek yoghurt', 0.5, 'dl', '½ dl Greek yoghurt']]],
      ],
      instructions: 'Fry the chicken until cooked through, then slice.\n\nServe over the rice and spinach with the yoghurt sauce.',
    },
    {
      name: 'Cheese omelette', servings: 1, extra: ['Quick'],
      sections: [
        ['', [['Eggs', 3, '', '3 eggs'], ['Cheddar', 30, 'g', '30 g cheddar'], ['Baby spinach', 30, 'g', 'a little spinach'], ['Olive oil', 0.5, 'msk', '½ tbsp oil']]],
      ],
      instructions: 'Beat the eggs, pour into a hot oiled pan and cook until almost set.\n\nScatter the cheese and spinach over one half and fold.',
    },
    {
      name: 'Yoghurt bowl with oats', servings: 1, extra: ['Quick'],
      sections: [
        ['', [['Greek yoghurt', 2, 'dl', '2 dl Greek yoghurt'], ['Rolled oats', 0.5, 'dl', '½ dl oats'], ['Banana', 1, 'st', '1 banana']]],
      ],
      instructions: 'Spoon the yoghurt into a bowl and top with the oats and sliced banana.',
    },
  ]
  for (const recipe of book) {
    await post('/api/recipes', {
      name: recipe.name,
      servings: recipe.servings,
      sections: recipe.sections.map(([name, lines]) => ({
        name,
        items: lines.map(([ing, amount, unit, text]) => ({
          ingredient_id: ingredient[ing], amount: String(amount), unit, original_text: text,
        })),
      })),
      instructions: recipe.instructions,
      source_url: '',
      extra_tag_ids: (recipe.extra ?? []).map((t) => tag[t]),
      min_multiplier: '0.5',
      max_multiplier: '2',
      step: null,
      hard_max_multiplier: null,
      serving_cap_weight: '1',
    })
  }

  // The plan setup: a week of three meals from today, lunch skipped at the weekend's end,
  // a Must and two Prefer goals, and no fish.
  const goal = (name: string, changes: Record<string, unknown>) => ({
    attribute_id: attribute[name], min: null, max: null, applies_to: 'day', must: false, importance: 3,
    zero_reference: null, ...changes,
  })
  await put('/api/plan', {
    start_date: localDate(),
    days: 7,
    meals: [{ name: 'Breakfast' }, { name: 'Lunch' }, { name: 'Dinner' }],
    skips: [{ day: 6, meal: 1 }],
    minimums: [],
    goals: [
      goal('Energy', { min: '1600', max: '2800', must: true }),
      goal('Protein', { min: '90', importance: 4 }),
      goal('Fibre', { min: '25', applies_to: 'daily_average' }),
    ],
    tag_filters: [{ tag_id: tag.Fish, mode: 'never' }],
    solve_time_limit: 10,
  })

  // One plan, solved, saved and used for today.
  const outcome = await post<{ plan: { id: number } | null; failure: string | null }>('/api/plan/solve', {
    solve_id: `sample-${Date.now()}`,
  })
  if (!outcome.plan) throw new Error(`The sample plan could not be made: ${outcome.failure}`)
  await post(`/api/plan-results/${outcome.plan.id}/save`)
  await post(`/api/plan-results/${outcome.plan.id}/use-for-today`)

  console.log(
    `Sample data added to ${api.origin}: ${Object.keys(attribute).length} attributes, ${Object.keys(tag).length} tags, ` +
      `${Object.keys(ingredient).length} ingredients, ${book.length} recipes and a saved plan (id ${outcome.plan.id}) used for today.`,
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
