import { vi } from 'vitest'
import { preferences, unitCatalogue } from './test-data'
import type { Preferences } from './api/types'

// The fake server both apps' tests answer calls with. Framework-free: the
// Vue harness (test-app.ts) and the React harness (app/test-app.tsx) both
// re-export it.

/** What the fake server answers: a status, a status with a JSON body, or a
 * function of the request's JSON body giving either, at once or later (a
 * promise, for a call that takes a while). */
export type FakeReply = number | { status?: number; body?: unknown }
export type FakeServer = Record<string, FakeReply | ((body: unknown) => FakeReply | Promise<FakeReply>)>

/** Stub fetch with a fake server, keyed by "METHOD /path"; anything not
 * listed answers 404. Returns the calls made, as "METHOD /path", with the
 * query if there is one ("GET /path?date=2026-09-22"). */
export function fakeServer(server: FakeServer) {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (request: Request) => {
    const url = new URL(request.url)
    const call = `${request.method} ${url.pathname}`
    calls.push(call + url.search)
    const handler = server[call] ?? 404
    const text = await request.text()
    const reply = typeof handler === 'function' ? await handler(text ? JSON.parse(text) : undefined) : handler
    const { status = 200, body = {} } = typeof reply === 'number' ? { status: reply } : reply
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  return calls
}

/** The answers for the unit catalogue and the preferences, to spread into a
 * fake server of a page that has a unit field. */
export function unitRoutes(fields: Partial<Preferences> = {}): FakeServer {
  return {
    'GET /api/units': { body: unitCatalogue() },
    'GET /api/preferences': { body: preferences(fields) },
  }
}
