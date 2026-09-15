import { useEffect, useLayoutEffect, useRef } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import type { StoryRow } from './succession-story';
import type { SuccessionStoryReader } from './use-succession-story';

export interface SuccessionTimelineProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  reader: SuccessionStoryReader;
  renderRow: (row: StoryRow) => ReactNode;
  scrollRoot?: 'document' | 'self';
}

/** Reading mechanics only. The caller owns rows, chapters, disclosure and visual composition. */
export function SuccessionTimeline({
  reader,
  renderRow,
  scrollRoot = 'document',
  style,
  ...props
}: SuccessionTimelineProps) {
  const root = useRef<HTMLDivElement>(null);
  const start = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const latest = useRef(reader);
  latest.current = reader;
  const adjusting = useRef(false);
  const previousScroll = useRef(0);
  const direction = useRef<'earlier' | 'later'>('later');
  const boundaryCheck = useRef(() => {});
  const ownsPosition = useRef(false);
  const wasEnabled = useRef(false);

  const top = () => (scrollRoot === 'self' ? (root.current?.getBoundingClientRect().top ?? 0) : 0);

  const bottom = () =>
    scrollRoot === 'self' ? (root.current?.getBoundingClientRect().bottom ?? 0) : window.innerHeight;

  const position = () => (scrollRoot === 'self' ? (root.current?.scrollTop ?? 0) : window.scrollY);

  const move = (delta: number) => {
    if (scrollRoot === 'self') root.current?.scrollBy({ top: delta, behavior: 'instant' });
    else window.scrollBy({ top: delta, behavior: 'instant' });
  };

  const ownsViewport = () => {
    // Document readers share a scroller. The first visible reader owns it, unless a
    // visible row in another reader has focus; offscreen anchors never claim it.
    if (scrollRoot === 'self') return true;

    const visible = Array.from(
      document.querySelectorAll<HTMLElement>('[data-story-scroll-root="document"]'),
    ).filter((element) => {
      const rect = element.getBoundingClientRect();

      return rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
    });

    const focused = document.activeElement;
    const focusRect = focused?.getBoundingClientRect();

    const focusedReader =
      focusRect && focusRect.bottom > 0 && focusRect.top < window.innerHeight
        ? visible.find((element) => focused !== element && element.contains(focused))
        : undefined;

    return (focusedReader ?? visible[0]) === root.current;
  };

  const remember = () => {
    const container = root.current;

    if (!container || !latest.current.enabled || !ownsPosition.current) return;
    const elements = Array.from(container.querySelectorAll<HTMLElement>('[data-story-key]'));
    const focused = elements.find((element) => element.contains(document.activeElement));

    const visible = elements.find(
      (element) =>
        element.getBoundingClientRect().bottom > top() && element.getBoundingClientRect().height > 0,
    );

    const element = focused ?? visible;

    if (element?.dataset.storyKey)
      latest.current.rememberAnchor({
        eventKey: element.dataset.storyKey,
        cursor: Number(element.dataset.storyCursor),
        offset: element.getBoundingClientRect().top - top(),
        focused: Boolean(focused),
      });
  };

  const restore = () => {
    if (!latest.current.enabled || !root.current || !ownsPosition.current || !ownsViewport()) return;
    adjusting.current = true;

    if (latest.current.following) {
      const edge = end.current?.getBoundingClientRect().bottom;

      if (edge !== undefined) move(edge - bottom());
    } else {
      const anchor = latest.current.getAnchor();

      const element =
        anchor &&
        Array.from(root.current.querySelectorAll<HTMLElement>('[data-story-key]')).find(
          (node) => node.dataset.storyKey === anchor.eventKey,
        );

      if (element) move(element.getBoundingClientRect().top - top() - anchor.offset);
    }

    previousScroll.current = position();
    adjusting.current = false;
    remember();
  };

  useLayoutEffect(() => {
    if (!reader.enabled) ownsPosition.current = false;
    else if (!wasEnabled.current) ownsPosition.current = ownsViewport();
    wasEnabled.current = reader.enabled;
    // Status/follow/head-only snapshots do not replace rows or move the reading anchor.
    restore();
  }, [reader.version, reader.enabled, scrollRoot]);

  useEffect(() => {
    boundaryCheck.current();
  }, [reader.head, reader.status]);

  useEffect(() => {
    const container = root.current;

    if (!container || !reader.enabled) return;
    const scroller = scrollRoot === 'self' ? container : window;
    let scheduled = 0;

    const boundaries = () => {
      scheduled = 0;
      const current = latest.current;

      if (!current.enabled || current.status !== 'ready') return;

      if (!ownsViewport()) return;
      ownsPosition.current = true;
      const first = start.current?.getBoundingClientRect();
      const last = end.current?.getBoundingClientRect();

      if (!first || !last || last.bottom < top() || first.top > bottom()) return;

      const earlier = first.top >= top() - 160;
      const later = last.bottom <= bottom() + 160;

      // A run of undisplayed private/audit rows can fit entirely in the viewport.
      // Continue the requested direction instead of bouncing between overlapping empty windows.
      if (direction.current === 'earlier' && earlier && current.hasEarlier && !current.following)
        void current.loadEarlier();
      else if (direction.current === 'later' && later && current.hasLater) void current.loadLater();
      else if (
        direction.current === 'later' &&
        earlier &&
        later &&
        !current.hasLater &&
        !current.following &&
        !current.getAnchor()?.focused
      )
        void current.follow();
    };

    const schedule = () => {
      if (!scheduled) scheduled = requestAnimationFrame(boundaries);
    };

    boundaryCheck.current = schedule;

    const intent = (delta: number) => {
      if (!delta) return;
      ownsPosition.current = ownsViewport();

      if (!ownsPosition.current) return;
      direction.current = delta < 0 ? 'earlier' : 'later';

      if (delta < 0) latest.current.detach();
      remember();
      schedule();
    };

    const wheel = (event: WheelEvent) => intent(event.deltaY);
    let touchY: number | undefined;

    const touchStart = (event: TouchEvent) => {
      touchY = event.touches[0]?.clientY;
    };

    const touchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY;

      if (y !== undefined && touchY !== undefined) intent(touchY - y);
      touchY = y;
    };

    const scroll = () => {
      if (adjusting.current) return;
      ownsPosition.current = ownsViewport();
      const currentPosition = position();

      if (!ownsPosition.current) {
        previousScroll.current = currentPosition;

        return;
      }

      const edge = end.current?.getBoundingClientRect().bottom ?? Infinity;

      if (Math.abs(currentPosition - previousScroll.current) > 2)
        direction.current = currentPosition < previousScroll.current ? 'earlier' : 'later';

      if (currentPosition < previousScroll.current - 2 || edge < top()) latest.current.detach();
      previousScroll.current = currentPosition;
      remember();

      if (
        !latest.current.following &&
        latest.current.status === 'ready' &&
        !latest.current.hasLater &&
        !latest.current.getAnchor()?.focused &&
        edge >= top() &&
        edge <= bottom() + 20
      )
        void latest.current.follow();
      schedule();
    };

    const focus = (event: FocusEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target !== container &&
        !event.target.closest('[data-story-key]')
      )
        return;
      ownsPosition.current = ownsViewport();

      if (!ownsPosition.current) return;

      if (event.target instanceof HTMLElement) {
        const row = event.target.closest<HTMLElement>('[data-story-cursor]');
        const previous = latest.current.getAnchor();

        if (row && previous && Number(row.dataset.storyCursor) !== previous.cursor)
          direction.current = Number(row.dataset.storyCursor) < previous.cursor ? 'earlier' : 'later';
      }

      latest.current.detach();
      remember();
      schedule();
    };

    const resize = new ResizeObserver(() => {
      restore();
      schedule();
    });

    resize.observe(container);

    if (scrollRoot === 'document') resize.observe(document.body);

    for (const element of container.querySelectorAll('[data-story-key]')) resize.observe(element);
    scroller.addEventListener('scroll', scroll, { passive: true });
    container.addEventListener('focusin', focus);
    container.addEventListener('wheel', wheel, { passive: true });
    container.addEventListener('touchstart', touchStart, { passive: true });
    container.addEventListener('touchmove', touchMove, { passive: true });
    window.addEventListener('resize', schedule);
    schedule();

    return () => {
      cancelAnimationFrame(scheduled);
      resize.disconnect();
      boundaryCheck.current = () => {};

      scroller.removeEventListener('scroll', scroll);
      container.removeEventListener('focusin', focus);
      container.removeEventListener('wheel', wheel);
      container.removeEventListener('touchstart', touchStart);
      container.removeEventListener('touchmove', touchMove);
      window.removeEventListener('resize', schedule);
    };
  }, [reader.enabled, reader.version, scrollRoot]);

  const readingStyle: CSSProperties = { ...style, overflowAnchor: 'none' };

  if (scrollRoot === 'self') readingStyle.overflowY = 'auto';

  return (
    <div
      {...props}
      ref={root}
      tabIndex={props.tabIndex ?? 0}
      style={readingStyle}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);

        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;

        if (
          event.target instanceof HTMLElement &&
          event.target.closest('input, textarea, select, [contenteditable="true"]')
        )
          return;

        const distance = new Map([
          ['ArrowUp', -40],
          ['ArrowDown', 40],
          ['PageUp', top() - bottom() + 40],
          ['PageDown', bottom() - top() - 40],
        ]).get(event.key);

        if (distance === undefined) return;
        event.preventDefault();
        ownsPosition.current = ownsViewport();
        direction.current = distance < 0 ? 'earlier' : 'later';
        latest.current.detach();
        move(distance);
        remember();
        boundaryCheck.current();
      }}
      aria-busy={reader.status === 'loading'}
      data-story-window=""
      data-story-scroll-root={scrollRoot}
      data-story-after={reader.after}
      data-story-delivered={reader.delivered}
    >
      <div ref={start} aria-hidden="true" />
      {reader.rows.map((row) => {
        const content = renderRow(row);

        return content == null ? null : (
          <div key={row.key} data-story-key={row.source.eventKey} data-story-cursor={row.source.cursor}>
            {content}
          </div>
        );
      })}
      <div ref={end} aria-hidden="true" />
      <div role="status" aria-live="polite">
        {reader.status === 'loading'
          ? 'Loading record…'
          : reader.status === 'paused'
            ? 'Offline. Waiting for connection to load the record.'
            : reader.status === 'ready' && reader.rows.length === 0
              ? 'No records yet.'
              : ''}
      </div>
      {reader.error && (
        <div role="alert">
          {reader.error}{' '}
          <button type="button" onClick={() => void reader.retry()}>
            Retry
          </button>
        </div>
      )}
      {!reader.following && reader.newEvents > 0 && (
        <button type="button" onClick={() => void reader.follow()}>
          {reader.newEvents} new records · Read latest
        </button>
      )}
    </div>
  );
}
