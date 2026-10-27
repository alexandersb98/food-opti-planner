"""The HTTP API: route modules, their schemas and the helpers they share.
The routes are put together in `routes`; this package imports nothing, so a
module outside it (such as `plans`) can use `errors` and `fields` without
loading every route."""
