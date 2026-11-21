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

// jsdom has the dialog element and its `open` attribute but none of its
// methods (the React Sheet opens one modally): open, close and the close
// event. Not modelled: the page behind a modal dialog being inert, and the
// cancel event on Escape (the Sheet handles Escape itself).
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.show = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    if (this.open) throw new DOMException('The dialog is already open.', 'InvalidStateError')
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}
