// jsdom lacks ResizeObserver, which Quasar's layout uses.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// ...and element scrolling, which Quasar's option menus use (a no-op here).
Element.prototype.scrollTo ??= () => {}

// One time zone for every run, ahead of UTC so tests show that times are
// the browser's local ones.
process.env.TZ = 'Europe/Stockholm'
