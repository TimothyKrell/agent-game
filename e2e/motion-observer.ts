import type { Page } from '@playwright/test';

declare global {
  interface Window {
    motionTrace: { target: string; at: number; duration: string; delay: number }[];
  }
}

/** Records actual Web Animations calls without changing their timing or completion. */
export async function observeMotion(page: Page) {
  await page.addInitScript(() => {
    window.motionTrace = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = original.apply(this, args);
      const timing = animation.effect?.getTiming();
      window.motionTrace.push({
        target: this.getAttribute('class') || this.tagName,
        at: performance.now(),
        duration: String(timing?.duration),
        delay: timing?.delay ?? 0,
      });

      return animation;
    };
  });
}

/** The browser event boundary is simulated; application subscriptions and live data updates are real. */
export async function visibility(page: Page, state: DocumentVisibilityState) {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}
