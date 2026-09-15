/** Verification-only scroll-call trace. Enabled explicitly; never part of the application graph. */
export async function driftTrace(page) {
  await page.addInitScript(() => {
    const capture = (operation, args = []) => {
      const trace = window.__dossierDrift;

      if (!trace) return;
      const row = document.querySelector(`[data-story-key="${trace.key}"]`);
      const root = row?.closest('[data-story-window]');
      trace.events.push({
        operation,
        args,
        time: performance.now(),
        scrollY,
        rowTop: row?.getBoundingClientRect().top,
        rowHeight: row?.getBoundingClientRect().height,
        after: root?.getAttribute('data-story-after'),
        delivered: root?.getAttribute('data-story-delivered'),
        stack: operation.endsWith(':before') ? new Error().stack : undefined,
      });
    };

    for (const method of ['scrollBy', 'scrollTo']) {
      const original = window[method].bind(window);
      window[method] = (...args) => {
        capture(`${method}:before`, args);
        const result = original(...args);
        capture(`${method}:after`, args);

        return result;
      };
    }

    window.addEventListener('scroll', () => capture('scroll'), { passive: true });
  });
}

/** Geometry sampling starts after native document-key motion has actually stopped. */
export async function settleDocumentScroll(page) {
  return page.evaluate(async () => {
    const samples = [{ time: performance.now(), y: scrollY }];
    let stable = 0;

    while (stable < 8) {
      await new Promise(requestAnimationFrame);
      const previous = samples.at(-1).y;
      samples.push({ time: performance.now(), y: scrollY });
      stable = previous === scrollY ? stable + 1 : 0;
    }

    return samples;
  });
}
