// jsdom lacks ResizeObserver, which Quasar's layout uses.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
