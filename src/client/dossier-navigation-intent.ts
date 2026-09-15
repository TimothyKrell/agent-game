export const dossierNavigationEvents = ['pointerdown', 'click', 'keydown', 'wheel', 'touchmove'] as const;

/** Refresh document-reader memory after a canceled seek, using the viewer's present position. */
export function dossierReadingAnchor(document: Document, act: 1 | 2) {
  if (document.querySelector('[role="dialog"]')) return null;

  const root = document.querySelector(
    `[data-story-window][aria-label="Act ${act === 1 ? 'I' : 'II'} record"]`,
  );

  const rows = Array.from(root?.querySelectorAll<HTMLElement>('[data-story-key]') ?? []);
  const focused = rows.find((row) => row.contains(document.activeElement));

  const element =
    focused ??
    rows.find((row) => {
      const box = row.getBoundingClientRect();

      return box.height > 0 && box.bottom > 0 && box.top < (document.defaultView?.innerHeight ?? 0);
    });

  if (!element?.dataset.storyKey) return null;

  return {
    eventKey: element.dataset.storyKey,
    cursor: Number(element.dataset.storyCursor),
    offset: element.getBoundingClientRect().top,
    focused: Boolean(focused),
  };
}

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
