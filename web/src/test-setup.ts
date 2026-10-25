// jsdom lacks ResizeObserver, which Quasar's layout uses.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// One time zone for every run, ahead of UTC so tests show that times are
// the browser's local ones.
process.env.TZ = 'Europe/Stockholm'
