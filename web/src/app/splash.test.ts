import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hideSplashWhenReady, type StartingRouter } from './splash'

function fakeRouter(initialized: boolean) {
  let listener: ((state: { initialized: boolean }) => void) | null = null
  const unsubscribe = vi.fn(() => {
    listener = null
  })
  const router: StartingRouter = {
    state: { initialized },
    subscribe: (l) => {
      listener = l
      return unsubscribe
    },
  }
  return { router, unsubscribe, emit: (initialized: boolean) => listener?.({ initialized }) }
}

describe('hideSplashWhenReady', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div id="splash" class="splash"></div>'
  })
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  const splash = () => document.getElementById('splash')

  it('keeps the splash while the first page is loading', () => {
    const { router, emit } = fakeRouter(false)
    hideSplashWhenReady(router)
    emit(false)
    vi.runAllTimers()
    expect(splash()).not.toBeNull()
    expect(splash()!.classList.contains('splash-out')).toBe(false)
  })

  it('fades the splash out and removes it once the router is ready', () => {
    const { router, emit, unsubscribe } = fakeRouter(false)
    hideSplashWhenReady(router)
    emit(true)
    expect(splash()!.classList.contains('splash-out')).toBe(true)
    expect(unsubscribe).toHaveBeenCalledOnce()
    vi.runAllTimers()
    expect(splash()).toBeNull()
  })

  it('removes the splash when the fade ends', () => {
    const { router, emit } = fakeRouter(false)
    hideSplashWhenReady(router)
    emit(true)
    splash()!.dispatchEvent(new Event('transitionend'))
    expect(splash()).toBeNull()
  })

  it('hides the splash at once for a router that is already ready', () => {
    const { router } = fakeRouter(true)
    hideSplashWhenReady(router)
    vi.runAllTimers()
    expect(splash()).toBeNull()
  })

  it('does nothing when there is no splash', () => {
    document.body.innerHTML = ''
    const { router } = fakeRouter(true)
    expect(() => hideSplashWhenReady(router)).not.toThrow()
  })
})
