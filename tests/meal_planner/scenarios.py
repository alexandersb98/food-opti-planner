"""Seeded random catalogs for property tests and the benchmark."""

import random

from meal_planner import AttributeDef, Constraint, Day, Ingredient, IngredientAmount, PlanRequest, Recipe, Slot

ATTRIBUTES = [AttributeDef("kcal", precision=0), AttributeDef("protein", precision=1),
              AttributeDef("cost", precision=2)]


def random_request(seed, recipes=10, days=3, slots=3, time_limit=30.0):
    rng = random.Random(seed)
    ingredients = [
        Ingredient(f"ing{i}", "g", {"kcal": rng.randint(1, 9), "protein": rng.randint(0, 3) / 10,
                                    "cost": rng.randint(1, 20) / 100})
        for i in range(12)
    ]
    catalog = []
    for r in range(recipes):
        items = [IngredientAmount(ing, rng.randint(2, 20) * 10)
                 for ing in rng.sample(ingredients, rng.randint(1, 4))]
        step = rng.choice([None, 0.5, 1])
        low = 1 if step == 1 else 0.5
        catalog.append(Recipe(f"recipe{r}", items, multiplier_step=step, min_multiplier=low))
    plan_days = []
    for _ in range(days):
        kinds = ["generated" if rng.random() < 0.85 else "absent" for _ in range(slots)]
        if "generated" not in kinds:
            kinds[0] = "generated"
        generated = kinds.count("generated")
        plan_days.append(Day([Slot(k) for k in kinds], min_meals_per_day=rng.randint(1, generated)))
    constraints = [
        Constraint("energy", "kcal", min=1800, max=2400),
        Constraint("protein", "protein", scope="horizon", aggregate="average_per_day",
                   min=60, weight=2),
        Constraint("budget", "cost", scope="horizon", aggregate="total", max=60 * days,
                   hard=True),
        Constraint("cheap days", "cost", max=80, hard=True),
    ]
    return PlanRequest(ATTRIBUTES, [], catalog, plan_days, constraints,
                       solve_time_limit=time_limit)
