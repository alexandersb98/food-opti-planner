def test_root_serves_the_app(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.text == "<html>app</html>"


def test_built_files_are_served(client):
    response = client.get("/assets/app.js")
    assert response.text == "console.log('app')"


def test_page_routes_serve_the_app(client):
    assert client.get("/recipes").text == "<html>app</html>"


def test_unknown_api_routes_are_404_not_the_app(client):
    response = client.get("/api/nothing")
    assert response.status_code == 404
    assert response.headers["content-type"] == "application/json"


def test_files_outside_the_build_are_not_served(client):
    assert client.get("/..%2F..%2Fetc%2Fpasswd").text == "<html>app</html>"
