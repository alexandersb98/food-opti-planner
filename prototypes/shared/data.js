// Made-up data shared by the three UI prototypes.
// Loaded with a plain <script> tag so the pages work when opened from disk (no fetch, no server).
// The shapes follow the real app loosely: a plan has a schedule, goals, recipe filters and a
// max solving time; a result has days of meals, each a recipe at a portion size.
window.MEAL_DATA = {
  attributes: [
    { id: "energy", name: "Energy", unit: "kcal", colour: "#e8833a" },
    { id: "protein", name: "Protein", unit: "g", colour: "#3a7be8" },
    { id: "fibre", name: "Fibre", unit: "g", colour: "#4caf50" },
    { id: "salt", name: "Salt", unit: "g", colour: "#9e9e9e" },
    { id: "cost", name: "Cost", unit: "kr", colour: "#b8860b" },
  ],

  plan: {
    schedule: {
      start: "2026-11-23", // a Monday
      days: 7,
      meals: ["Breakfast", "Lunch", "Dinner"],
      // skipped[dayIndex] = list of meal names not planned that day (eating out etc.)
      skipped: { 4: ["Dinner"], 5: ["Lunch"] },
      // atLeast[dayIndex] = the planner may leave some meals empty that day
      atLeast: { 6: 2 },
    },
    goals: [
      { id: "g1", name: "Energy on average", attribute: "energy", min: 1500, max: 2000, scope: "daily_average", strictness: "must" },
      { id: "g2", name: "Enough protein", attribute: "protein", min: 100, max: null, scope: "day", strictness: "prefer", importance: 4 },
      { id: "g3", name: "Fibre on average", attribute: "fibre", min: 30, max: null, scope: "daily_average", strictness: "prefer", importance: 3 },
      { id: "g4", name: "Keep salt down", attribute: "salt", min: null, max: 6, scope: "day", strictness: "prefer", importance: 2 },
      { id: "g5", name: "Weekly budget", attribute: "cost", min: null, max: 650, scope: "plan_total", strictness: "prefer", importance: 5 },
    ],
    tagFilters: [
      { tag: "Pork", mode: "never" },
      { tag: "Weeknight", mode: "only", note: "Mon–Thu dinners" },
    ],
    maxSeconds: 30,
  },

  tags: ["Vegetarian", "Fish", "Pork", "Chicken", "Beef", "Weeknight", "Batch cook", "Spicy", "Gluten-free", "Dairy"],

  // Per-portion totals. hue is used to draw a coloured placeholder instead of a photo.
  recipes: [
    { id: "r1", name: "Overnight oats with lingonberries", serves: 2, minutes: 5, tags: ["Vegetarian", "Dairy"], hue: 340,
      per: { energy: 420, protein: 18, fibre: 9, salt: 0.3, cost: 9 } },
    { id: "r2", name: "Rye crispbread, egg & caviar", serves: 1, minutes: 10, tags: ["Fish"], hue: 30,
      per: { energy: 380, protein: 22, fibre: 7, salt: 2.1, cost: 12 } },
    { id: "r3", name: "Skyr bowl with seeds", serves: 1, minutes: 3, tags: ["Vegetarian", "Dairy", "Gluten-free"], hue: 200,
      per: { energy: 350, protein: 28, fibre: 6, salt: 0.2, cost: 14 } },
    { id: "r4", name: "Lentil & tomato soup", serves: 6, minutes: 40, tags: ["Vegetarian", "Batch cook", "Gluten-free"], hue: 15,
      per: { energy: 480, protein: 24, fibre: 14, salt: 1.4, cost: 11 } },
    { id: "r5", name: "Salmon, dill potatoes & peas", serves: 4, minutes: 30, tags: ["Fish", "Weeknight", "Gluten-free"], hue: 12,
      per: { energy: 690, protein: 41, fibre: 7, salt: 1.2, cost: 38 } },
    { id: "r6", name: "Chicken & barley salad", serves: 4, minutes: 25, tags: ["Chicken", "Weeknight"], hue: 90,
      per: { energy: 560, protein: 44, fibre: 9, salt: 1.5, cost: 29 } },
    { id: "r7", name: "Pytt i panna, veggie style", serves: 4, minutes: 35, tags: ["Vegetarian", "Weeknight"], hue: 45,
      per: { energy: 610, protein: 22, fibre: 8, salt: 1.9, cost: 16 } },
    { id: "r8", name: "Beef & root veg stew", serves: 6, minutes: 120, tags: ["Beef", "Batch cook", "Gluten-free"], hue: 0,
      per: { energy: 640, protein: 39, fibre: 8, salt: 1.8, cost: 34 } },
    { id: "r9", name: "Chickpea curry with brown rice", serves: 4, minutes: 35, tags: ["Vegetarian", "Spicy", "Weeknight"], hue: 38,
      per: { energy: 620, protein: 21, fibre: 13, salt: 1.3, cost: 15 } },
    { id: "r10", name: "Cod in creamy leek sauce", serves: 4, minutes: 30, tags: ["Fish", "Dairy", "Weeknight"], hue: 55,
      per: { energy: 540, protein: 38, fibre: 4, salt: 1.6, cost: 33 } },
    { id: "r11", name: "Halloumi & quinoa traybake", serves: 3, minutes: 40, tags: ["Vegetarian", "Dairy", "Gluten-free"], hue: 120,
      per: { energy: 650, protein: 30, fibre: 10, salt: 2.4, cost: 27 } },
    { id: "r12", name: "Pork schnitzel & potato salad", serves: 4, minutes: 40, tags: ["Pork"], hue: 25,
      per: { energy: 820, protein: 40, fibre: 5, salt: 2.6, cost: 30 } },
  ],

  // The recipe shown in the recipe editor of each prototype.
  recipeDetail: {
    id: "r9",
    name: "Chickpea curry with brown rice",
    serves: 4,
    minutes: 35,
    source: "https://example.com/chickpea-curry",
    tags: ["Vegetarian", "Spicy", "Weeknight"],
    derivedTags: ["Vegetarian", "Gluten-free"], // from the ingredients, by each tag's rule
    portion: { from: 0.5, to: 1.5, step: 0.5 },
    sections: [
      { name: "Curry", lines: [
        { ingredient: "Chickpeas, cooked", amount: 500, unit: "g" },
        { ingredient: "Crushed tomatoes", amount: 400, unit: "g" },
        { ingredient: "Coconut milk, light", amount: 4, unit: "dl", note: "1 dl = 100 g" },
        { ingredient: "Yellow onion", amount: 2, unit: "pcs", note: "1 pcs = 120 g" },
        { ingredient: "Garlic", amount: 3, unit: "cloves", note: "1 clove = 5 g" },
        { ingredient: "Fresh ginger", amount: 20, unit: "g" },
        { ingredient: "Curry powder", amount: 2, unit: "tbsp" },
        { ingredient: "Baby spinach", amount: 100, unit: "g" },
      ]},
      { name: "To serve", lines: [
        { ingredient: "Brown rice, dry", amount: 3, unit: "dl", note: "1 dl = 85 g" },
        { ingredient: "Fresh coriander", amount: 1, unit: "bunch", needsReview: true },
      ]},
    ],
    instructions: [
      "Chop the onion, garlic and ginger. Fry in a little oil for 5 minutes.",
      "Add the curry powder and fry 1 more minute.",
      "Add tomatoes, coconut milk and chickpeas. Simmer 15 minutes.",
      "Stir in the spinach. Serve with the rice and coriander.",
    ],
  },

  // The newest result from Make plan. Day index matches the schedule; null = skipped meal.
  result: {
    status: "optimal", // optimal | time_ran_out | stopped
    solvedIn: 11,
    saved: false,
    days: [
      { meals: [["r3", 1], ["r4", 1], ["r5", 1]], totals: { energy: 1520, protein: 93, fibre: 27, salt: 2.8, cost: 63 } },
      { meals: [["r1", 1], ["r6", 1], ["r9", 1.5]], totals: { energy: 1910, protein: 94, fibre: 37, salt: 3.8, cost: 61 } },
      { meals: [["r2", 1], ["r4", 1], ["r10", 1]], totals: { energy: 1400, protein: 84, fibre: 25, salt: 5.1, cost: 56 } },
      { meals: [["r3", 1], ["r6", 1], ["r7", 1.5]], totals: { energy: 1825, protein: 105, fibre: 27, salt: 4.6, cost: 67 } },
      { meals: [["r1", 1], ["r4", 1.5], null], totals: { energy: 1140, protein: 54, fibre: 30, salt: 2.4, cost: 26 } },
      { meals: [["r2", 1.5], null, ["r8", 1.5]], totals: { energy: 1530, protein: 92, fibre: 22, salt: 5.9, cost: 69 } },
      { meals: [["r3", 1], ["r11", 1], ["r8", 1]], totals: { energy: 1640, protein: 97, fibre: 24, salt: 4.4, cost: 75 } },
    ],
    missedGoals: [
      { goal: "g2", text: "Protein under 100 g on 6 of 7 days", worst: "Fri: 54 g" },
      { goal: "g3", text: "Fibre averaged 27.4 g a day, goal at least 30 g", worst: null },
    ],
    planTotals: { energy: 10965, protein: 619, fibre: 192, salt: 28.2, cost: 417 },
  },

  savedPlans: [
    { id: "p1", label: "Week 46", start: "2026-11-09", days: 7, savedAt: "2026-11-08 20:14", today: false },
    { id: "p2", label: "Week 47", start: "2026-11-16", days: 7, savedAt: "2026-11-15 21:02", today: true },
  ],

  ingredients: [
    "Chickpeas, cooked", "Crushed tomatoes", "Coconut milk, light", "Yellow onion", "Garlic", "Fresh ginger",
    "Curry powder", "Baby spinach", "Brown rice, dry", "Fresh coriander", "Salmon fillet", "Potatoes", "Dill",
    "Frozen peas", "Rolled oats", "Lingonberries", "Skyr, plain", "Pumpkin seeds", "Red lentils", "Cod fillet",
    "Leek", "Halloumi", "Quinoa", "Chicken breast", "Pearl barley", "Beef chuck", "Carrots", "Parsnip",
  ],
};
