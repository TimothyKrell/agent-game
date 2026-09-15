export const dossierNavigationEvents = ['pointerdown', 'click', 'keydown', 'wheel', 'touchmove'] as const;

/** One explicit reading request owns focus only until the viewer takes another action. */
export function dossierNavigationIntent(document: Document, onIntervene: () => void) {
  const owner = document.activeElement;
  const listeners = new AbortController();

  const cancel = () => listeners.abort();

  const intervene = () => {
    cancel();
    onIntervene();
  };

  // Installed synchronously inside the activating click, after its capture phase.
  // Listen only for new input: native scroll events also fire for window replacement,
  // browser clamping and our own scrollIntoView, and cannot establish viewer intent.
  for (const type of dossierNavigationEvents)
    document.addEventListener(type, intervene, { capture: true, passive: true, signal: listeners.signal });

  return {
    signal: listeners.signal,
    cancel,
    complete() {
      const ownsFocus = owner?.isConnected && document.activeElement === owner;
      const modal = document.querySelector('[role="dialog"]');
      const allowed = !listeners.signal.aborted && ownsFocus && !modal;
      // Consume before any focus/scroll work. A completed request cannot cancel its successor.
      cancel();

      return allowed;
    },
  };
}
