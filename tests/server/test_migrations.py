from decimal import Decimal

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from meal_planner import IngredientAmount, Recipe
from server import queries, translate
from server.db import alembic_config, migrate
from server.models import Base


def test_migrations_build_the_tables_the_models_describe(database_url):
    migrate(database_url)
    engine = create_engine(database_url)
    with engine.connect() as connection:
        differences = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    engine.dispose()
    assert differences == []


def test_the_app_migrates_on_startup(client, database_url):
    engine = create_engine(database_url)
    with engine.connect() as connection:
        assert MigrationContext.configure(connection).get_current_revision() is not None
    engine.dispose()


def _recipe_before_sections(database_url):
    """The database as it was before recipe sections (revision 0013), with a
    recipe of two items inserted in reverse position order. Answers the
    library `Recipe` it must still give."""
    command.upgrade(alembic_config(database_url), "0013")
    engine = create_engine(database_url)
    with engine.begin() as c:
        c.execute(text("INSERT INTO attributes (id, name, unit, decimals) VALUES (1, 'Energy', 'kcal', 0)"))
        c.execute(text("INSERT INTO tags (id, name, derive) VALUES (1, 'vegan', 'all'), (2, 'quick', 'all')"))
        c.execute(text(
            "INSERT INTO ingredients (id, name, unit, basis) VALUES (1, 'Oats', 'g', 100), (2, 'Milk', 'ml', 100)"
        ))
        c.execute(text("INSERT INTO ingredient_values (ingredient_id, attribute_id, value) VALUES (1, 1, 389)"))
        c.execute(text("INSERT INTO ingredient_tags (ingredient_id, tag_id) VALUES (1, 1)"))
        c.execute(text(
            "INSERT INTO recipes (id, name, min_multiplier, max_multiplier, step, hard_max_multiplier,"
            " serving_cap_weight) VALUES (1, 'Porridge', 0.5, 2, NULL, NULL, 1)"
        ))
        c.execute(text(
            "INSERT INTO recipe_items (recipe_id, ingredient_id, position, amount)"
            " VALUES (1, 2, 1, 200), (1, 1, 0, 60)"
        ))
        c.execute(text("INSERT INTO recipe_extra_tags (recipe_id, tag_id) VALUES (1, 2)"))
    return engine


def test_a_recipe_from_before_gives_the_same_library_recipe(database_url):
    engine = _recipe_before_sections(database_url)
    command.upgrade(alembic_config(database_url), "head")
    with Session(engine) as db:
        [row] = db.scalars(queries.recipes()).all()
        assert (row.servings, row.instructions, row.source_url) == (1, "", "")
        [section] = row.sections
        assert section.name == ""
        assert [(i.ingredient.name, i.amount, i.original_text) for i in section.items] == [
            ("Oats", 60, ""), ("Milk", 200, ""),
        ]
        oats = translate.ingredient(row.lines[0].ingredient)
        milk = translate.ingredient(row.lines[1].ingredient)
        expected = Recipe(
            name="Porridge",
            items=(IngredientAmount(oats, 60), IngredientAmount(milk, 200)),
            extra_tags=frozenset({"quick"}),
            min_multiplier=0.5, max_multiplier=2, serving_cap_weight=1,
        )
        assert translate.recipe(row) == expected
        assert oats.attributes == {"Energy": Decimal("3.89")} and oats.tags == frozenset({"vegan"})
    engine.dispose()


def test_downgrade_restores_one_line_per_ingredient(database_url):
    engine = _recipe_before_sections(database_url)
    command.upgrade(alembic_config(database_url), "head")
    with engine.begin() as c:
        c.execute(text("UPDATE recipes SET servings = 2"))
        c.execute(text("INSERT INTO recipe_sections (id, recipe_id, position, name) VALUES (100, 1, 1, 'Topping')"))
        c.execute(text(
            "INSERT INTO recipe_items (section_id, position, ingredient_id, amount, original_text)"
            " VALUES (100, 0, 1, 20, '')"
        ))
    command.downgrade(alembic_config(database_url), "0013")
    with engine.connect() as c:
        rows = c.execute(text(
            "SELECT recipe_id, ingredient_id, position, amount FROM recipe_items ORDER BY position"
        )).all()
    assert [(r.recipe_id, r.ingredient_id, r.position, float(r.amount)) for r in rows] == [
        (1, 1, 0, 40.0), (1, 2, 1, 100.0),
    ]
    engine.dispose()


LINE_UNITS = "0015"  # the migration of slice R3


def _before_line_units(database_url):
    """The database as it was before line units: Porridge of 60 g Oats."""
    config = alembic_config(database_url)
    before = ScriptDirectory.from_config(config).get_revision(LINE_UNITS).down_revision
    command.upgrade(config, before)
    engine = create_engine(database_url)
    with engine.begin() as c:
        c.execute(text("INSERT INTO attributes (id, name, unit, decimals) VALUES (1, 'Energy', 'kcal', 0)"))
        c.execute(text("INSERT INTO ingredients (id, name, unit, basis) VALUES (1, 'Oats', 'g', 100)"))
        c.execute(text("INSERT INTO ingredient_values (ingredient_id, attribute_id, value) VALUES (1, 1, 389)"))
        c.execute(text(
            "INSERT INTO recipes (id, name, min_multiplier, max_multiplier, step, hard_max_multiplier,"
            " serving_cap_weight, servings, instructions, source_url)"
            " VALUES (1, 'Porridge', 0.5, 2, NULL, NULL, 1, 1, '', '')"
        ))
        c.execute(text("INSERT INTO recipe_sections (id, recipe_id, position, name) VALUES (1, 1, 0, '')"))
        c.execute(text(
            "INSERT INTO recipe_items (id, section_id, position, ingredient_id, amount, original_text)"
            " VALUES (1, 1, 0, 1, 60, '')"
        ))
    return config, before, engine


def test_lines_from_before_have_the_own_unit_and_no_conversions(database_url):
    config, _, engine = _before_line_units(database_url)
    command.upgrade(config, "head")
    with engine.connect() as c:
        assert c.execute(text("SELECT unit FROM recipe_items")).scalars().all() == [""]
        assert c.execute(text("SELECT count(*) FROM ingredient_conversions")).scalar_one() == 0
    with Session(engine) as db:
        [row] = db.scalars(queries.recipes()).all()
        oats = translate.ingredient(row.lines[0].ingredient)
        expected = Recipe(
            name="Porridge", items=(IngredientAmount(oats, 60),),
            min_multiplier=0.5, max_multiplier=2, serving_cap_weight=1,
        )
        assert translate.recipe(row) == expected
    engine.dispose()


def test_the_downgrade_is_refused_while_a_line_has_a_unit(database_url):
    config, before, engine = _before_line_units(database_url)
    command.upgrade(config, "head")
    with engine.begin() as c:
        c.execute(text("UPDATE recipe_items SET unit = 'dl'"))
        c.execute(text(
            "INSERT INTO ingredient_conversions (ingredient_id, unit, factor, source) VALUES (1, 'dl', 40, 'user')"
        ))
    with pytest.raises(RuntimeError, match="1 recipe line"):
        command.downgrade(config, before)
    with engine.connect() as c:
        assert c.execute(text("SELECT unit FROM recipe_items")).scalars().all() == ["dl"]
        assert c.execute(text("SELECT count(*) FROM ingredient_conversions")).scalar_one() == 1
    engine.dispose()


def test_the_downgrade_drops_the_conversions_and_the_unit_column(database_url):
    config, before, engine = _before_line_units(database_url)
    command.upgrade(config, "head")
    with engine.begin() as c:
        c.execute(text(
            "INSERT INTO ingredient_conversions (ingredient_id, unit, factor, source) VALUES (1, 'dl', 40, 'user')"
        ))
    command.downgrade(config, before)
    with engine.connect() as c:
        columns = {col["name"] for col in inspect(c).get_columns("recipe_items")}
        assert "unit" not in columns
        assert "ingredient_conversions" not in inspect(c).get_table_names()
        assert c.execute(text("SELECT amount FROM recipe_items")).scalar_one() == 60
    engine.dispose()
