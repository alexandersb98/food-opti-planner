import { readFileSync } from 'node:fs'
import openapiTS, { astToString } from 'openapi-typescript'
import { expect, test } from 'vitest'

// web/openapi.json is checked against the server by tests/server/test_openapi.py.
test('schema.ts matches openapi.json (regenerate with: npm run gen:api)', async () => {
  const description = JSON.parse(readFileSync('openapi.json', 'utf8'))
  const generated = astToString(await openapiTS(description))
  const committed = readFileSync('src/api/schema.ts', 'utf8')
  const withoutBanner = committed.replace(/^\/\*\*[\s\S]*?\*\/\n\n/, '') // the CLI adds a header comment
  expect(withoutBanner).toBe(generated)
})
