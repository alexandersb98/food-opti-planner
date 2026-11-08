def test_the_units_offered_in_catalogue_order(client):
    response = client.get("/api/units")
    assert response.status_code == 200
    units = response.json()
    assert [(u["symbol"], u["category"]) for u in units] == [
        *[(s, "mass") for s in ("µg", "mg", "g", "oz", "lb", "kg")],
        *[(s, "volume") for s in ("ml", "krm", "tsp", "cl", "tbsp", "fl oz", "dl", "US cup", "metric cup", "l")],
        *[(s, "energy") for s in ("kJ", "kcal")],
        ("st", None),
    ]


def test_each_unit_has_its_aliases(client):
    units = {u["symbol"]: u["aliases"] for u in client.get("/api/units").json()}
    assert units["tbsp"] == ["msk", "tablespoon", "matsked", "msk."]
    assert units["st"] == ["st.", "stycken", "styck", "pcs", "piece", "pieces"]
    assert units["µg"] == ["ug", "mcg"]
    assert units["kg"] == []


def test_the_units_need_a_session(anonymous_client):
    assert anonymous_client.get("/api/units").status_code == 401
