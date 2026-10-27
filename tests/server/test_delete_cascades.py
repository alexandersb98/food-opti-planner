"""Deleting an attribute or a tag is allowed after a warning, and removes
it from whatever uses it. Each list response counts those uses for the
warning. Deleting an ingredient a recipe uses is refused instead (test_recipes.py)."""


def by_name(client, path, field):
    return {row["name"]: row[field] for row in client.get(path).json()}


def test_an_attribute_counts_the_ingredients_with_a_value_for_it(client, catalog):
    energy, protein = catalog.attribute(), catalog.attribute("Protein")
    catalog.ingredient(values={energy: "389", protein: "0"})
    catalog.ingredient("Milk", values={energy: "64"})
    catalog.ingredient("Salt")
    assert by_name(client, "/api/attributes", "ingredient_count") == {"Energy": 2, "Protein": 1}
    renamed = client.put(f"/api/attributes/{energy}", json={"name": "Kcal", "unit": "kcal", "decimals": 0})
    assert renamed.json()["ingredient_count"] == 2


def test_deleting_an_attribute_removes_its_ingredient_values(client, catalog):
    energy, protein = catalog.attribute(), catalog.attribute("Protein")
    oats = catalog.ingredient(values={energy: "389", protein: "16.9"})
    assert client.delete(f"/api/attributes/{energy}").status_code == 204
    stored = client.get(f"/api/ingredients/{oats}").json()
    assert stored["values"] == [{"attribute_id": protein, "value": "16.9"}]


def test_a_tag_counts_the_ingredients_that_have_it(client, catalog):
    vegan, quick = catalog.tag(), catalog.tag("quick")
    catalog.tag("organic")
    catalog.ingredient(tag_ids=[vegan, quick])
    catalog.ingredient("Milk", tag_ids=[quick])
    assert by_name(client, "/api/tags", "ingredient_count") == {"vegan": 1, "quick": 2, "organic": 0}
    renamed = client.put(f"/api/tags/{quick}", json={"name": "fast", "derive": "any"})
    assert renamed.json()["ingredient_count"] == 2


def test_deleting_a_tag_removes_it_from_ingredients(client, catalog):
    vegan, quick = catalog.tag(), catalog.tag("quick")
    oats = catalog.ingredient(tag_ids=[vegan, quick])
    assert client.delete(f"/api/tags/{vegan}").status_code == 204
    assert client.get(f"/api/ingredients/{oats}").json()["tag_ids"] == [quick]



def test_a_tag_counts_the_recipes_it_was_added_to(client, catalog):
    vegan, quick = catalog.tag(), catalog.tag("quick")
    oats = catalog.ingredient(tag_ids=[vegan])
    catalog.recipe(items={oats: "60"}, extra_tag_ids=[quick])
    catalog.recipe("Muesli", items={oats: "80"}, extra_tag_ids=[quick, vegan])
    assert by_name(client, "/api/tags", "recipe_count") == {"vegan": 1, "quick": 2}


def test_deleting_a_tag_removes_it_from_recipes(client, catalog):
    vegan, quick = catalog.tag(), catalog.tag("quick")
    porridge = catalog.recipe(extra_tag_ids=[vegan, quick])
    assert client.delete(f"/api/tags/{vegan}").status_code == 204
    assert client.get(f"/api/recipes/{porridge}").json()["extra_tag_ids"] == [quick]


def test_deleting_an_attribute_removes_it_from_recipe_totals(client, catalog):
    energy, protein = catalog.attribute(), catalog.attribute("Protein")
    porridge = catalog.recipe(items={catalog.ingredient(values={energy: "389", protein: "17"}): "100"})
    assert client.delete(f"/api/attributes/{energy}").status_code == 204
    totals = client.get(f"/api/recipes/{porridge}").json()["totals"]
    assert totals == [{"attribute_id": protein, "value": "17"}]


def test_an_attribute_counts_its_goals(client, catalog):
    energy, protein = catalog.attribute(), catalog.attribute("Protein")
    goal = {"min": "1", "max": None, "applies_to": "day", "must": False, "importance": 3, "zero_reference": None}
    plan = client.get("/api/plan").json()
    plan["goals"] = [{**goal, "attribute_id": energy}, {**goal, "attribute_id": energy, "min": "2"}, {**goal, "attribute_id": protein}]
    assert client.put("/api/plan", json=plan).status_code == 200
    assert by_name(client, "/api/attributes", "goal_count") == {"Energy": 2, "Protein": 1}


def test_deleting_an_attribute_removes_its_goals(client, catalog):
    energy, protein = catalog.attribute(), catalog.attribute("Protein")
    goal = {"min": "1", "max": None, "applies_to": "day", "must": False, "importance": 3, "zero_reference": None}
    plan = client.get("/api/plan").json()
    plan["goals"] = [{**goal, "attribute_id": energy}, {**goal, "attribute_id": protein}]
    assert client.put("/api/plan", json=plan).status_code == 200
    assert client.delete(f"/api/attributes/{energy}").status_code == 204
    assert [g["attribute_id"] for g in client.get("/api/plan").json()["goals"]] == [protein]


def test_a_tag_counts_the_plan_filters_on_it(client, catalog):
    vegan, nuts = catalog.tag(), catalog.tag("contains-nuts")
    catalog.tag("quick")
    plan = client.get("/api/plan").json()
    plan["tag_filters"] = [{"tag_id": vegan, "mode": "only"}, {"tag_id": nuts, "mode": "never"}]
    assert client.put("/api/plan", json=plan).status_code == 200
    assert by_name(client, "/api/tags", "filter_count") == {"vegan": 1, "contains-nuts": 1, "quick": 0}


def test_deleting_a_tag_removes_its_plan_filter(client, catalog):
    vegan, nuts = catalog.tag(), catalog.tag("contains-nuts")
    plan = client.get("/api/plan").json()
    plan["tag_filters"] = [{"tag_id": vegan, "mode": "only"}, {"tag_id": nuts, "mode": "never"}]
    assert client.put("/api/plan", json=plan).status_code == 200
    assert client.delete(f"/api/tags/{vegan}").status_code == 204
    assert client.get("/api/plan").json()["tag_filters"] == [{"tag_id": nuts, "mode": "never"}]
