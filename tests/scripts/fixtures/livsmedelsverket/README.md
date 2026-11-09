# Recorded-response fixture for the Livsmedelsverket import

`responses.json` stands in for the Livsmedelsverket API in the tests of
`scripts/import_livsmedelsverket.py`.

**It is not a live capture.** Its shape comes from the API documentation and a
web search (see `.superpowers/sdd/2026-11-08-units-sources-import-slices/d1-api-research.md`).
The three foods are named `TEST ...` and their numbers are made up. They must
never be copied into the real data file or presented as Livsmedelsverket's data.

## Layout

One JSON object from request key to response body. The request key is
`"<path>?<query sorted by name>"`, for example
`/livsmedel?limit=2&offset=0&sprak=1`; a path without a query has no `?`.
Keys starting with `_` (such as `_note`) are ignored by the replay fetcher.
Asking for a request that is not in the file is an error, so a test also shows
when the script makes a request it should not.

## Replacing it with a real capture

On the first real run, record what the API says:

    python3 scripts/import_livsmedelsverket.py --limit-foods 3 --out /tmp/x.json.gz \
        --min-foods 0 --record tests/scripts/fixtures/livsmedelsverket/responses.json

then update the test assertions that name the made-up foods.
