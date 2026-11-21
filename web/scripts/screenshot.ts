// Screenshots of one view at 390 × 844 (phone) and 1280 × 800 (desktop), in the paper
// and evening editions: four PNGs named <name>-<phone|desktop>-<paper|evening>.png.
//
//   npm run shot -- /next/recipes            a route of the dev server (React under /next/, Vue at /)
//   npm run shot -- d2:recipe/r1             a D2 prototype view, opened from disk
//
// Options:
//   --name <name>        file name prefix (default: from the target)
//   --click <name>       click the button or link with this accessible name first (repeatable, in order)
//   --step <file>        run a module first whose default export is `async (page) => {}` (Playwright Page)
//   --wait <text>        wait until this text is visible before shooting
//   --reduced-motion     emulate prefers-reduced-motion: reduce
//   --full-page          the whole page, not just the viewport
//   --out <dir>          where the PNGs go (default: SHOTS_DIR, else web/screenshots/, which git ignores)
//   --no-login           don't log in first (to shoot the login page)
// Settings: PLANNER_APP (default http://localhost:5173), PLANNER_PASSWORD (default "sample").
// Only a localhost app is shot (the script logs in with the password).

import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'

const WEB_DIR = resolve(import.meta.dirname, '..')
const D2_INDEX = resolve(WEB_DIR, '../prototypes/d2-editorial-refined/index.html')
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

const SIZES = {
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 } },
} satisfies Record<string, BrowserContextOptions>

// Editions are forced through the colour-scheme emulation. Ticket 05 adds a stored
// edition choice: put its localStorage key (and stored values) here, and the script
// also writes it before the app loads, so a stored choice can't override the emulation.
const EDITION_STORAGE: { key: string | null; values: Record<Edition, string> } = {
  key: process.env.EDITION_STORAGE_KEY ?? null,
  values: { paper: 'paper', evening: 'evening' },
}
const EDITIONS = { paper: 'light', evening: 'dark' } as const
type Edition = keyof typeof EDITIONS

type Action = { click: string } | { step: string }

interface Options {
  target: string
  name: string | null
  actions: Action[]
  wait: string | null
  reducedMotion: boolean
  fullPage: boolean
  out: string
  login: boolean
}

const usage = 'Usage: npm run shot -- <route like /next/recipes | d2:<view> like d2:menu> [--name n] [--click name]... ' +
  '[--step file] [--wait text] [--reduced-motion] [--full-page] [--out dir] [--no-login]'

// npm runs scripts in web/; paths given on the command line are read from where npm was started.
const fromCaller = (path: string) => resolve(process.env.INIT_CWD ?? process.cwd(), path)

function parse(args: string[]): Options {
  const options: Options = {
    target: '', name: null, actions: [], wait: null, reducedMotion: false, fullPage: false,
    out: process.env.SHOTS_DIR ? fromCaller(process.env.SHOTS_DIR) : resolve(WEB_DIR, 'screenshots'), login: true,
  }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const value = () => {
      const next = args[++i]
      if (next === undefined) throw new Error(`${arg} needs a value.\n${usage}`)
      return next
    }
    if (arg === '--name') options.name = value()
    else if (arg === '--click') options.actions.push({ click: value() })
    else if (arg === '--step') options.actions.push({ step: fromCaller(value()) })
    else if (arg === '--wait') options.wait = value()
    else if (arg === '--reduced-motion') options.reducedMotion = true
    else if (arg === '--full-page') options.fullPage = true
    else if (arg === '--out') options.out = fromCaller(value())
    else if (arg === '--no-login') options.login = false
    else if (arg.startsWith('--') || options.target) throw new Error(`Unexpected argument ${arg}.\n${usage}`)
    else options.target = arg
  }
  if (!options.target) throw new Error(usage)
  return options
}

/** The URL to open, and the app origin to log in to (null for the prototype). */
function locate(target: string): { url: string; app: URL | null } {
  if (target === 'd2' || target.startsWith('d2:')) {
    const view = target.slice(3).replace(/^#/, '') || 'plan'
    return { url: `${pathToFileURL(D2_INDEX).href}#${view}`, app: null }
  }
  if (!target.startsWith('/')) throw new Error(`A target is a route starting with "/" or d2:<view>.\n${usage}`)
  const app = new URL(process.env.PLANNER_APP ?? 'http://localhost:5173')
  if (!LOCAL_HOSTS.has(app.hostname)) throw new Error(`Refusing ${app.origin}: screenshots are of a local app only (localhost).`)
  return { url: new URL(target, app).href, app }
}

function defaultName(target: string): string {
  const slug = target.replace(/^d2:?/, 'd2-').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug || 'home'
}

/** The session cookie for the app, logged in through the browser (the cookie is Secure,
 * which Chromium accepts on http://localhost). */
async function logIn(browser: Browser, app: URL): Promise<BrowserContextOptions['storageState']> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(new URL('/api/health', app).href)
  const status = await page.evaluate(async (password) => {
    const response = await fetch('/api/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }),
    })
    return response.status
  }, process.env.PLANNER_PASSWORD ?? 'sample')
  if (status >= 300) console.warn(`Login answered ${status}: shooting logged out. Is PLANNER_PASSWORD the backend's password?`)
  const state = await context.storageState()
  await context.close()
  return state
}

/** Waits until the page is quiet: network idle, fonts loaded, finite animations done. */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  await page.evaluate(async () => {
    await document.fonts.ready
    const finite = document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
    await Promise.race([
      Promise.all(finite.map((a) => a.finished.catch(() => {}))),
      new Promise((done) => setTimeout(done, 3000)),
    ])
  })
}

async function act(page: Page, action: Action) {
  if ('click' in action) {
    const name = action.click
    await page.getByRole('button', { name, exact: true }).or(page.getByRole('link', { name, exact: true })).first().click()
  } else {
    const module = (await import(pathToFileURL(action.step).href)) as { default?: (page: Page) => Promise<void> }
    if (typeof module.default !== 'function') throw new Error(`${action.step} has no default export function (page) => {}`)
    await module.default(page)
  }
  await settle(page)
}

async function main() {
  const options = parse(process.argv.slice(2))
  const { url, app } = locate(options.target)
  const name = options.name ?? defaultName(options.target)
  await mkdir(options.out, { recursive: true })

  const browser = await chromium.launch()
  try {
    const storageState = app && options.login ? await logIn(browser, app) : undefined
    for (const [size, sizeOptions] of Object.entries(SIZES)) {
      for (const [edition, colorScheme] of Object.entries(EDITIONS) as [Edition, 'light' | 'dark'][]) {
        const context = await browser.newContext({
          ...sizeOptions, colorScheme, storageState,
          reducedMotion: options.reducedMotion ? 'reduce' : 'no-preference',
        })
        if (app && EDITION_STORAGE.key) {
          await context.addInitScript(
            ([key, value]) => { try { localStorage.setItem(key, value) } catch { /* storage blocked */ } },
            [EDITION_STORAGE.key, EDITION_STORAGE.values[edition]] as const,
          )
        }
        const page = await context.newPage()
        page.on('pageerror', (error) => console.warn(`[${size} ${edition}] page error: ${error.message}`))
        await page.goto(url)
        await settle(page)
        for (const action of options.actions) await act(page, action)
        if (options.wait) {
          await page.getByText(options.wait).first().waitFor({ state: 'visible' })
          await settle(page)
        }
        const file = resolve(options.out, `${name}-${size}-${edition}.png`)
        await page.screenshot({ path: file, fullPage: options.fullPage })
        console.log(file)
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
