import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

const Motion = createContext({ enabled: false, entries: false });

const responsive = 'cubic-bezier(.2,.8,.2,1)';

const ceremonial = 'cubic-bezier(.16,1,.3,1)';

const active = new Set<Animation>();

function animate(element: Element, frames: Keyframe[], options: KeyframeAnimationOptions) {
  if (document.documentElement.dataset.motion !== 'enabled') return null;
  const animation = element.animate(frames, options);
  active.add(animation);
  void animation.finished.then(
    () => active.delete(animation),
    () => active.delete(animation),
  );

  return animation;
}

/** A presentation-only capability. Disabling it consumes, rather than postpones, entrances. */
export function MotionProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(
    () =>
      document.visibilityState === 'visible' && matchMedia('(prefers-reduced-motion: no-preference)').matches,
  );

  const [entries, setEntries] = useState(
    () =>
      !location.hash &&
      !performance
        .getEntriesByType('navigation')
        .some((entry) => entry instanceof PerformanceNavigationTiming && entry.type === 'back_forward'),
  );

  useLayoutEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: no-preference)');

    const update = () => {
      const allowed = media.matches && document.visibilityState === 'visible';
      document.documentElement.dataset.motion = allowed ? 'enabled' : 'static';

      if (!allowed) {
        delete document.documentElement.dataset.motionHover;

        for (const animation of active) animation.cancel();
      }

      setEnabled(allowed);
    };

    const restored = () => setEntries(false);
    const navigated = () => setEntries(!location.hash);

    const pointer = () => {
      if (document.documentElement.dataset.motion === 'enabled')
        document.documentElement.dataset.motionHover = 'ready';
    };

    update();
    media.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('popstate', restored);
    window.addEventListener('hashchange', restored);
    window.addEventListener('app:navigate', navigated);
    window.addEventListener('pointermove', pointer, { passive: true });

    return () => {
      media.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('popstate', restored);
      window.removeEventListener('hashchange', restored);
      window.removeEventListener('app:navigate', navigated);
      window.removeEventListener('pointermove', pointer);
      delete document.documentElement.dataset.motion;
      delete document.documentElement.dataset.motionHover;

      for (const animation of active) animation.cancel();
    };
  }, []);

  return <Motion.Provider value={{ enabled, entries }}>{children}</Motion.Provider>;
}

type Entry = 'title' | 'artwork' | 'result' | 'partial';

function enter(element: HTMLElement, scene: Entry): Animation[] {
  const animations: Animation[] = [];

  const add = (selector: string, frames: Keyframe[], duration: number, delay = 0, easing = responsive) => {
    for (const target of element.querySelectorAll(selector)) {
      const animation = animate(target, frames, { duration, delay, easing, fill: 'backwards' });

      if (animation) animations.push(animation);
    }
  };

  if (scene === 'artwork') {
    add(
      '.art-rings-entry',
      [
        { opacity: 0.65, transform: 'scale(.985)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      520,
      40,
      ceremonial,
    );
    add(
      '.art-center-entry',
      [
        { opacity: 0.7, transform: 'scale(.96)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      420,
      120,
      ceremonial,
    );
    add('.art-terminals', [{ opacity: 0.65 }, { opacity: 1 }], 240, 120);
  } else if (scene === 'partial') {
    add('h1', [{ opacity: 0.9 }, { opacity: 1 }], 180);
  } else {
    const distance = matchMedia('(max-width: 760px)').matches ? 2 : 4;
    add(
      'h1',
      [
        {
          opacity: scene === 'title' && element.classList.contains('splash-copy') ? 0.88 : 0.9,
          transform: `translateY(${distance}px)`,
        },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      240,
    );

    if (scene === 'result')
      add(
        '.result-banner > .deco-emblem',
        [
          { opacity: 0.7, transform: 'scale(.97)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
        420,
        40,
        ceremonial,
      );
  }

  return animations;
}

/** The callback ref also handles titles that appear after their resource has loaded. */
export function useMotionEntry(scene: Entry) {
  const { enabled, entries } = useContext(Motion);
  const [element, setElement] = useState<HTMLElement | null>(null);
  const consumed = useRef(false);

  useEffect(() => {
    if (!element) return;

    if (
      consumed.current ||
      !enabled ||
      !entries ||
      location.hash ||
      element.contains(document.activeElement)
    ) {
      element.dataset.motionSettled = 'true';
      consumed.current = true;

      return;
    }

    let animations: Animation[] = [];

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        consumed.current = true;
        observer.disconnect();

        if (element.contains(document.activeElement)) {
          element.dataset.motionSettled = 'true';

          return;
        }

        animations = enter(element, scene);
        void Promise.all(animations.map((animation) => animation.finished.catch(() => {}))).then(() => {
          element.dataset.motionSettled = 'true';
        });
      },
      { threshold: 0.15 },
    );

    observer.observe(scene === 'artwork' ? element : (element.querySelector('h1') ?? element));

    return () => {
      observer.disconnect();

      for (const animation of animations) animation.cancel();
    };
  }, [element, enabled, entries, scene]);

  return setElement;
}

/** Explicit selection changes only: retained polling and automatic fallback never call this. */
export function useSelectionMotion() {
  const { enabled } = useContext(Motion);
  const ref = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);

  useEffect(() => () => animation.current?.cancel(), [enabled]);

  return {
    ref,
    cue: () => {
      animation.current?.cancel();

      if (enabled && ref.current)
        animation.current = animate(ref.current, [{ opacity: 0.88 }, { opacity: 1 }], {
          duration: 180,
          easing: responsive,
        });
    },
  };
}

/** Animate the new indicator, never its control or a re-selected/retained item. */
export function useUnderlineMotion(value: string) {
  const { enabled } = useContext(Motion);
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef<Element | null>(null);

  useLayoutEffect(() => {
    const selected =
      ref.current?.querySelector('a.active, button[aria-pressed="true"], button.selected') ?? null;

    const changed = previous.current !== null && selected !== previous.current;
    previous.current = selected;

    if (!enabled || !selected || !changed) return;

    const animation = animate(
      selected,
      [
        { opacity: 0.4, transform: 'scaleX(.72)' },
        { opacity: 1, transform: 'scaleX(1)' },
      ],
      { duration: 180, easing: responsive, pseudoElement: '::after' },
    );

    return () => animation?.cancel();
  }, [enabled, value]);

  return ref;
}
