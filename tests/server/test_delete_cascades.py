"""Deleting an attribute or a tag is allowed after a warning, and removes
it from whatever uses it. Each list response counts those uses for the
warning. Deleting an ingredient a recipe uses is refused instead (test_recipes.py)."""


from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from server import models

from .conftest import Catalog


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


def column_ids(client, source):
    """Column ids of a source by column key."""
    columns = client.get(f"/api/data-sources/{source}").json()["columns"]
    return {c["key"]: c["id"] for c in columns}


def map_column(client, column_id, attribute_id, *, withdrawn=False):
    """Map a column straight in the database (the API route is tested elsewhere)."""
    with Session(client.app.state.engine) as db:
        column = db.get(models.SourceColumn, column_id)
        column.attribute_id, column.withdrawn = attribute_id, withdrawn
        db.commit()


def mapping(client, column_id):
    with Session(client.app.state.engine) as db:
        return db.get(models.SourceColumn, column_id).attribute_id


def test_an_attribute_counts_the_columns_mapped_to_it(two_sources_client):
    client, catalog = two_sources_client, Catalog(two_sources_client)
    protein = catalog.attribute("Protein", "g")
    catalog.attribute("Energy", "kcal")
    test, other = column_ids(client, "testsource"), column_ids(client, "other")
    map_column(client, test["PROT"], protein)
    map_column(client, other["PROT"], protein, withdrawn=True)
    assert by_name(client, "/api/attributes", "mapping_count") == {"Protein": 2, "Energy": 0}


def test_deleting_an_attribute_clears_the_mappings_and_keeps_the_columns(two_sources_client):
    client, catalog = two_sources_client, Catalog(two_sources_client)
    protein, energy = catalog.attribute("Protein", "g"), catalog.attribute("Energy", "kcal")
    test, other = column_ids(client, "testsource"), column_ids(client, "other")
    map_column(client, test["PROT"], protein)
    map_column(client, test["ENERC:kcal"], energy)
    map_column(client, other["PROT"], protein)

    assert client.delete(f"/api/attributes/{protein}").status_code == 204

    assert mapping(client, test["PROT"]) is None and mapping(client, other["PROT"]) is None
    assert mapping(client, test["ENERC:kcal"]) == energy
    assert set(column_ids(client, "testsource")) == {"PROT", "ENERC:kcal", "VITD"}


def test_mapping_through_the_api_is_counted_and_deleting_clears_it(data_client):
    protein = Catalog(data_client).attribute("Protein", "g", 1)
    column = column_ids(data_client, "testsource")["PROT"]
    url = f"/api/data-sources/testsource/columns/{column}"

    data_client.put(url, json={"attribute_id": protein})
    assert by_name(data_client, "/api/attributes", "mapping_count") == {"Protein": 1}
    data_client.put(url, json={"attribute_id": None})
    assert by_name(data_client, "/api/attributes", "mapping_count") == {"Protein": 0}
    data_client.put(url, json={"attribute_id": protein})
    assert data_client.delete(f"/api/attributes/{protein}").status_code == 204

    columns = data_client.get("/api/data-sources/testsource").json()["columns"]
    assert {c["key"]: c["attribute_id"] for c in columns}["PROT"] is None


def test_deleting_an_attribute_removes_copied_values_with_their_source_values_and_keeps_the_link(data_client):
    from .test_ingredients_from_source import add, map_columns, source_values

    made_attributes = map_columns(data_client, {"PROT": ("Protein", "g"), "ENERC:kcal": ("Energy", "kcal")})
    made = add(data_client).json()
    protein = made_attributes["PROT"]
    assert data_client.delete(f"/api/attributes/{protein}").status_code == 204
    assert list(source_values(data_client, made["id"])) == [made_attributes["ENERC:kcal"]]
    assert data_client.get(f"/api/ingredients/{made['id']}").json()["source"]["food_name"] == "TEST Oats"


def test_deleting_a_linked_ingredient_leaves_the_source_food(data_client):
    from .test_ingredients_from_source import add

    made = add(data_client).json()
    assert data_client.delete(f"/api/ingredients/{made['id']}").status_code == 204
    foods = data_client.get("/api/data-sources/testsource/foods").json()
    assert foods["total"] == 3


def test_deleting_a_tag_group_row_keeps_its_tags_and_clears_their_group(client, catalog):
    fish, seafood = catalog.tag("Fish"), catalog.tag("Seafood")
    with Session(client.app.state.engine) as db:
        group = models.TagGroup()
        db.add(group)
        db.flush()
        for tag_id in (fish, seafood):
            db.get(models.Tag, tag_id).group_id = group.id
        db.commit()
        db.delete(group)
        db.commit()
        assert [(t.name, t.group_id) for t in db.query(models.Tag).order_by(models.Tag.id)] == [
            ("Fish", None),
            ("Seafood", None),
        ]


def conversion_count(database_url):
    engine = create_engine(database_url)
    with Session(engine) as db:
        count = db.scalar(select(func.count()).select_from(models.IngredientConversion))
    engine.dispose()
    return count


def test_deleting_an_ingredient_removes_its_unused_conversions(client, catalog, database_url):
    oats, milk = catalog.ingredient(), catalog.ingredient("Milk", unit="ml")
    catalog.conversion(oats, "dl", "40")
    catalog.conversion(oats, "pinch", "0.3")
    catalog.conversion(milk, "pinch", "0.3")
    assert client.delete(f"/api/ingredients/{oats}").status_code == 204
    assert conversion_count(database_url) == 1
    assert client.get(f"/api/ingredients/{milk}").json()["conversions"][0]["unit"] == "pinch"


def test_an_ingredient_in_use_is_still_refused_and_keeps_its_conversions(client, catalog, database_url):
    oats = catalog.ingredient()
    catalog.conversion(oats, "dl", "40")
    catalog.recipe(items={oats: "60"})
    assert client.delete(f"/api/ingredients/{oats}").status_code == 409
    assert conversion_count(database_url) == 1
