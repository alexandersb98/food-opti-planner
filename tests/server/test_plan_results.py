"""/api/plan-results: the unsaved plan and the saved ones, frozen copies of
what was planned; and the plan used for a date."""

from datetime import UTC, date, datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from server import models

from .conftest import RECIPE
from .test_solve import solve, summary


def saved_plan(client) -> dict:
    """Make a plan and save it, answering it as read back."""
    plan_id = solve(client)["plan"]["id"]
    response = client.post(f"/api/plan-results/{plan_id}/save")
    assert response.status_code == 200, response.text
    return client.get(f"/api/plan-results/{plan_id}").json()


def results(client) -> dict:
    response = client.get("/api/plan-results")
    assert response.status_code == 200, response.text
    return response.json()


def today(client, date: str) -> dict | None:
    response = client.get("/api/plan-results/today", params={"date": date})
    assert response.status_code == 200, response.text
    return response.json()


def test_there_are_no_plans_at_first(client):
    assert results(client) == {"unsaved": None, "saved": []}


def test_saving_the_unsaved_plan_lists_it_as_saved(client, porridge):
    plan = solve(client)["plan"]
    before = datetime.now(UTC)
    response = client.post(f"/api/plan-results/{plan['id']}/save")
    assert response.status_code == 200, response.text
    stored = client.get(f"/api/plan-results/{plan['id']}").json()
    assert response.json() == summary(stored)
    assert stored["saved"] is True
    assert datetime.fromisoformat(stored["saved_at"]) >= before
    assert stored == {**plan, "saved": True, "saved_at": stored["saved_at"]}
    assert results(client) == {"unsaved": None, "saved": [summary(stored)]}


def test_saved_plans_are_listed_newest_saved_first(client, porridge):
    first = saved_plan(client)
    second = saved_plan(client)
    assert results(client)["saved"] == [summary(second), summary(first)]
    # Use for today does not change when a plan was saved.
    client.post(f"/api/plan-results/{first['id']}/use-for-today")
    assert results(client)["saved"] == [summary(second), summary(first)]


def test_a_new_plan_leaves_the_saved_ones_alone(client, porridge):
    kept = saved_plan(client)
    new = solve(client)["plan"]
    assert results(client) == {"unsaved": summary(new), "saved": [summary(kept)]}


def test_a_saved_plan_cannot_be_saved_again(client, porridge):
    plan = saved_plan(client)
    response = client.post(f"/api/plan-results/{plan['id']}/save")
    assert response.status_code == 409
    assert client.get(f"/api/plan-results/{plan['id']}").json() == plan


def test_only_a_saved_plan_can_be_used_for_today(client, porridge):
    plan = solve(client)["plan"]
    assert client.post(f"/api/plan-results/{plan['id']}/use-for-today").status_code == 409


def test_discarding_deletes_the_unsaved_plan(client, porridge):
    plan = solve(client)["plan"]
    assert client.delete(f"/api/plan-results/{plan['id']}").status_code == 204
    assert results(client) == {"unsaved": None, "saved": []}
    assert client.get(f"/api/plan-results/{plan['id']}").status_code == 404


def test_deleting_a_saved_plan(client, porridge):
    first, second = saved_plan(client), saved_plan(client)
    assert client.delete(f"/api/plan-results/{first['id']}").status_code == 204
    assert results(client)["saved"] == [summary(second)]


def test_unknown_plans_are_404(client):
    for response in (
        client.get("/api/plan-results/99"),
        client.post("/api/plan-results/99/save"),
        client.post("/api/plan-results/99/use-for-today"),
        client.delete("/api/plan-results/99"),
    ):
        assert response.status_code == 404
        assert response.json() == {"detail": "No such plan"}


def test_no_plan_is_used_for_today_without_saved_plans(client, porridge):
    solve(client)  # an unsaved plan is never today's
    assert today(client, "2026-10-26") is None


def test_today_is_the_day_of_the_saved_plan_covering_the_date(client, porridge):
    plan = saved_plan(client)
    assert today(client, "2026-10-27") == {
        "id": plan["id"],
        "day": 1,
        "date": "2026-10-27",
        "meals": plan["meals"][1],
    }
    assert today(client, "2026-10-26")["day"] == 0


def test_a_date_outside_every_plan_has_none(client, porridge):
    saved_plan(client)
    assert today(client, "2026-10-25") is None
    assert today(client, "2026-10-28") is None


def test_the_newest_saved_plan_is_used_until_another_is_chosen(client, porridge):
    first = saved_plan(client)
    second = saved_plan(client)
    assert today(client, "2026-10-26")["id"] == second["id"]
    response = client.post(f"/api/plan-results/{first['id']}/use-for-today")
    assert response.status_code == 200, response.text
    assert response.json() == summary(first)
    assert today(client, "2026-10-26")["id"] == first["id"]


def test_a_plan_covering_the_date_wins_over_a_newer_one_that_does_not(client, porridge):
    covering = saved_plan(client)
    setup = client.get("/api/plan").json()
    client.put("/api/plan", json={**setup, "start_date": "2026-11-02"})
    saved_plan(client)
    assert today(client, "2026-10-26")["id"] == covering["id"]


def test_today_needs_a_date(client):
    assert client.get("/api/plan-results/today").status_code == 422
    assert client.get("/api/plan-results/today", params={"date": "tomorrow"}).status_code == 422


def test_a_saved_plan_is_unchanged_by_catalog_edits_and_deletes(client, catalog, porridge):
    plan = saved_plan(client)
    recipe = client.get(f"/api/recipes/{porridge}").json()
    edited = {
        **RECIPE,
        "name": "Oat porridge",
        "items": recipe["items"][:1],
        "extra_tag_ids": [],
        "min_multiplier": "1",
        "max_multiplier": "1",
    }
    assert client.put(f"/api/recipes/{porridge}", json=edited).status_code == 200
    assert client.get(f"/api/plan-results/{plan['id']}").json() == plan
    # Nothing in a saved plan blocks a delete.
    assert client.delete(f"/api/recipes/{porridge}").status_code == 204
    for attribute in client.get("/api/attributes").json():
        assert client.delete(f"/api/attributes/{attribute['id']}").status_code == 204
    for ingredient in client.get("/api/ingredients").json():
        assert client.delete(f"/api/ingredients/{ingredient['id']}").status_code == 204
    assert client.get(f"/api/plan-results/{plan['id']}").json() == plan


def test_the_database_keeps_at_most_one_unsaved_plan(client, database_url):
    engine = create_engine(database_url)

    def plan_result(saved: bool) -> models.PlanResult:
        return models.PlanResult(
            saved=saved, created_at=datetime(2026, 10, 25), start_date=date(2026, 10, 26), days=1, status="optimal"
        )

    with Session(engine) as db:
        db.add_all([plan_result(True), plan_result(True), plan_result(False)])
        db.commit()
        db.add(plan_result(False))
        with pytest.raises(IntegrityError):
            db.commit()
    engine.dispose()
