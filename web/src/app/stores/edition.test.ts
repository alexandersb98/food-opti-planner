import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { EDITION_STORAGE_KEY, editionStore } from './edition'

const LIGHT = '(prefers-color-scheme: light)'
const DARK = '(prefers-color-scheme: dark)'

/** The theme-color tags as the React HTML entry has them. */
function addThemeColorTags() {
  document.head.innerHTML = `
    <meta name="theme-color" content="#f4efe4" media="${LIGHT}" data-media="${LIGHT}">
    <meta name="theme-color" content="#16130f" media="${DARK}" data-media="${DARK}">`
}
const themeColorMedia = () =>
  [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((m) => [m.content, m.media])
const dataTheme = () => document.documentElement.getAttribute('data-theme')

beforeEach(() => {
  localStorage.clear()
  addThemeColorTags()
  editionStore.reset()
})
afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.head.innerHTML = ''
})

describe('the edition store', () => {
  test('follows the device by default: no data-theme, theme-color tags keep their media queries', () => {
    expect(editionStore.getSnapshot()).toBe('device')
    expect(dataTheme()).toBeNull()
    expect(themeColorMedia()).toEqual([['#f4efe4', LIGHT], ['#16130f', DARK]])
  })

  test('the evening edition sets data-theme="dark", is kept under the versioned key and lights the dark theme colour', () => {
    editionStore.set('evening')

    expect(editionStore.getSnapshot()).toBe('evening')
    expect(dataTheme()).toBe('dark')
    expect(localStorage.getItem(EDITION_STORAGE_KEY)).toBe('evening')
    expect(EDITION_STORAGE_KEY).toMatch(/\.v\d+$/)
    expect(themeColorMedia()).toEqual([['#f4efe4', 'not all'], ['#16130f', 'all']])
  })

  test('the paper edition sets data-theme="light" even on a dark device', () => {
    editionStore.set('paper')

    expect(dataTheme()).toBe('light')
    expect(localStorage.getItem(EDITION_STORAGE_KEY)).toBe('paper')
    expect(themeColorMedia()).toEqual([['#f4efe4', 'all'], ['#16130f', 'not all']])
  })

  test('going back to the device removes data-theme, the stored value and restores the media queries', () => {
    editionStore.set('evening')
    editionStore.set('device')

    expect(dataTheme()).toBeNull()
    expect(localStorage.getItem(EDITION_STORAGE_KEY)).toBeNull()
    expect(themeColorMedia()).toEqual([['#f4efe4', LIGHT], ['#16130f', DARK]])
  })

  test('a stored choice is read back (the next visit)', () => {
    localStorage.setItem(EDITION_STORAGE_KEY, 'paper')
    editionStore.reset()

    expect(editionStore.getSnapshot()).toBe('paper')
    expect(dataTheme()).toBe('light')
  })

  test.each([['sepia'], [''], ['"evening"'], ['constructor']])('a corrupt stored value (%j) falls back to the device', (value) => {
    localStorage.setItem(EDITION_STORAGE_KEY, value)
    editionStore.reset()

    expect(editionStore.getSnapshot()).toBe('device')
    expect(dataTheme()).toBeNull()
  })

  test('blocked storage falls back to the device, and a choice still applies for the visit', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    try {
      editionStore.reset()
      expect(editionStore.getSnapshot()).toBe('device')

      editionStore.set('evening')
      expect(editionStore.getSnapshot()).toBe('evening')
      expect(dataTheme()).toBe('dark')
    } finally {
      getItem.mockRestore()
      setItem.mockRestore()
    }
  })

  test('subscribers hear a change, and a change made in another tab', () => {
    const listener = vi.fn()
    const unsubscribe = editionStore.subscribe(listener)

    editionStore.set('evening')
    expect(listener).toHaveBeenCalledTimes(1)
    editionStore.set('evening')
    expect(listener).toHaveBeenCalledTimes(1)

    localStorage.setItem(EDITION_STORAGE_KEY, 'paper')
    window.dispatchEvent(new StorageEvent('storage', { key: EDITION_STORAGE_KEY }))
    expect(listener).toHaveBeenCalledTimes(2)
    expect(editionStore.getSnapshot()).toBe('paper')
    expect(dataTheme()).toBe('light')

    unsubscribe()
    editionStore.set('device')
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe('the script in the HTML entry that applies the edition before first paint', () => {
  const html = readFileSync(resolve(__dirname, '../../../index.html'), 'utf8')
  const inline = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''
  const runInline = () => new Function(inline)()

  test('uses the store’s key', () => {
    expect(inline).toContain(`'${EDITION_STORAGE_KEY}'`)
  })

  test.each([
    ['evening', 'dark', [['#f4efe4', 'not all'], ['#16130f', 'all']]],
    ['paper', 'light', [['#f4efe4', 'all'], ['#16130f', 'not all']]],
  ])('applies a stored %s edition like the store does', (stored, theme, media) => {
    localStorage.setItem(EDITION_STORAGE_KEY, stored)
    runInline()

    expect(dataTheme()).toBe(theme)
    expect(themeColorMedia()).toEqual(media)
  })

  test.each([[null], ['sepia'], ['constructor']])('leaves the page to the device for a stored %j', (stored) => {
    if (stored !== null) localStorage.setItem(EDITION_STORAGE_KEY, stored)
    runInline()

    expect(dataTheme()).toBeNull()
    expect(themeColorMedia()).toEqual([['#f4efe4', LIGHT], ['#16130f', DARK]])
  })
})
