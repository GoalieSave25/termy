// Global ref for the animated terminal removal function.
// Set by CarouselLayout, called by keyboard shortcuts.
let _animatedRemove: ((itemId: string) => void) | null = null;

export function setAnimatedRemove(fn: ((itemId: string) => void) | null) {
  _animatedRemove = fn;
}

export function animatedRemoveTerminal(itemId: string) {
  if (_animatedRemove) {
    _animatedRemove(itemId);
  }
}
