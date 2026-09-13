import type { Page } from '@playwright/test';

export interface SuccessionMotionRecord {
  kind: string;
  at: number;
  detail: string;
}

declare global {
  interface Window {
    recordSuccessionMotion(entry: SuccessionMotionRecord): Promise<void>;
  }
}

/** Observe native animation calls and lifecycle without altering frames or timing. */
export async function traceSuccessionMotion(page: Page) {
  const records: SuccessionMotionRecord[] = [];
  await page.exposeFunction('recordSuccessionMotion', (entry: SuccessionMotionRecord) => records.push(entry));
  await page.addInitScript(() => {
    let serial = 0;

    const report = (
      kind: string,
      detail: {
        target: string;
        animationId: string;
        timing?: EffectTiming;
        keyframes?: ComputedKeyframe[];
        pseudoElement?: string | null;
        text?: string;
      },
    ) => {
      void window.recordSuccessionMotion({ kind, at: Date.now(), detail: JSON.stringify(detail) });
    };

    const original = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = original.apply(this, args);
      const animationId = `${performance.timeOrigin}:${serial++}`;
      const target = `${this.tagName}.${this.getAttribute('class') ?? ''}`;
      const timing = animation.effect?.getTiming();
      const keyframes = animation.effect instanceof KeyframeEffect ? animation.effect.getKeyframes() : [];
      report('animate', {
        target,
        animationId,
        timing,
        keyframes,
        pseudoElement: animation.effect instanceof KeyframeEffect ? animation.effect.pseudoElement : null,
        text: this.textContent?.slice(0, 80),
      });
      animation.addEventListener('cancel', () => report('cancel', { target, animationId }));
      animation.addEventListener('finish', () => report('finish', { target, animationId }));

      return animation;
    };
  });

  return records;
}

export async function motionMark(page: Page, action: string) {
  await page.evaluate(
    (value) =>
      window.recordSuccessionMotion({
        kind: 'action',
        at: Date.now(),
        detail: JSON.stringify({
          action: value,
          viewport: [innerWidth, innerHeight],
          documentTimeOrigin: performance.timeOrigin,
          documentElapsed: performance.now(),
          reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
          visibility: document.visibilityState,
          running: document.getAnimations().filter((animation) => animation.playState === 'running').length,
          settled: document.querySelectorAll('[data-motion-settled="true"]').length,
          hoverReady: document.documentElement.dataset.motionHover ?? null,
        }),
      }),
    action,
  );
}
