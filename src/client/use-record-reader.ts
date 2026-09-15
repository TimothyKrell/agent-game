import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export interface RecordReaderAnchor {
  identity: string;
  top: number;
  discussion?: boolean;
}

interface RecordReaderOptions {
  identities: string[];
  initialFollowing: boolean;
  initialAnchor: RecordReaderAnchor | null;
  announceAdditions?: boolean;
  onChange: (state: { following: boolean; anchor: RecordReaderAnchor | null }) => void;
}

const bottomThreshold = 48;

function distanceFromPageEnd() {
  return document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
}

function movePage(top: number) {
  const root = document.documentElement;
  const behavior = root.style.scrollBehavior;

  root.style.scrollBehavior = 'auto';
  window.scrollTo({ top });
  root.style.scrollBehavior = behavior;
}

/** Keeps a long, page-scrolling record stable while live events arrive or older history is prepended. */
export function useRecordReader({
  identities,
  initialFollowing,
  initialAnchor,
  announceAdditions = true,
  onChange,
}: RecordReaderOptions) {
  const record = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(initialFollowing);
  const anchor = useRef<RecordReaderAnchor | null>(initialAnchor);
  const previous = useRef<string[]>([]);
  const lastScrollY = useRef(0);
  const programmatic = useRef(false);
  const [atLatest, setAtLatest] = useState(initialFollowing);
  const [unread, setUnread] = useState(0);

  const remember = useCallback(() => {
    onChange({ following: following.current, anchor: anchor.current });
  }, [onChange]);

  const readAnchor = useCallback(() => {
    const rows = record.current?.querySelectorAll<HTMLElement>('[data-reader-identity]');

    const row =
      rows &&
      Array.from(rows).find(
        (entry) =>
          entry.getBoundingClientRect().bottom > 0 &&
          (entry.dataset.readerDiscussion !== 'true' || entry.classList.contains('is-collapsed')),
      );

    if (!row?.dataset.readerIdentity) return;
    anchor.current = {
      identity: row.dataset.readerIdentity,
      top: row.getBoundingClientRect().top,
      discussion: row.dataset.readerDiscussion === 'true',
    };
  }, []);

  const stopAt = useCallback(
    (element: Element, identity: string, discussion = false) => {
      following.current = false;
      setAtLatest(false);
      anchor.current = { identity, top: element.getBoundingClientRect().top, discussion };
      remember();
    },
    [remember],
  );

  const jumpToStart = useCallback(() => {
    const top = record.current ? record.current.getBoundingClientRect().top + window.scrollY - 12 : 0;

    following.current = false;
    setAtLatest(false);
    programmatic.current = true;
    movePage(top);
    lastScrollY.current = window.scrollY;
    readAnchor();
    remember();
    requestAnimationFrame(() => (programmatic.current = false));
  }, [readAnchor, remember]);

  const jumpToLatest = useCallback(() => {
    following.current = true;
    setAtLatest(true);
    setUnread(0);
    programmatic.current = true;
    movePage(document.documentElement.scrollHeight);
    lastScrollY.current = window.scrollY;
    readAnchor();
    remember();
    requestAnimationFrame(() => (programmatic.current = false));
  }, [readAnchor, remember]);

  const jumpTo = useCallback(
    (element: Element, identity?: string) => {
      following.current = false;
      setAtLatest(false);
      programmatic.current = true;
      movePage(element.getBoundingClientRect().top + window.scrollY - 96);
      lastScrollY.current = window.scrollY;
      anchor.current = identity ? { identity, top: element.getBoundingClientRect().top } : null;
      remember();
      requestAnimationFrame(() => (programmatic.current = false));
    },
    [remember],
  );

  useLayoutEffect(() => {
    lastScrollY.current = window.scrollY;

    const onScroll = () => {
      if (programmatic.current || window.scrollY === lastScrollY.current) return;
      const movedUp = window.scrollY < lastScrollY.current;
      const bottom = distanceFromPageEnd() < bottomThreshold;

      lastScrollY.current = window.scrollY;

      if (movedUp) following.current = false;
      else if (bottom) following.current = true;
      setAtLatest(following.current && bottom);

      if (following.current && bottom) setUnread(0);
      readAnchor();
      remember();
    };

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => window.removeEventListener('scroll', onScroll);
  }, [readAnchor, remember]);

  useLayoutEffect(() => {
    const old = previous.current;
    const oldLast = old.at(-1);
    const oldLastIndex = oldLast ? identities.indexOf(oldLast) : -1;
    const appended = old.length && oldLastIndex >= 0 ? identities.slice(oldLastIndex + 1).length : 0;

    const restore = () => {
      programmatic.current = true;

      if (following.current) movePage(document.documentElement.scrollHeight);
      else if (anchor.current) {
        const rows = record.current?.querySelectorAll<HTMLElement>('[data-reader-identity]');

        const row =
          rows &&
          Array.from(rows).find(
            (entry) =>
              entry.dataset.readerIdentity === anchor.current?.identity &&
              (entry.dataset.readerDiscussion === 'true') === Boolean(anchor.current?.discussion),
          );

        if (row) movePage(window.scrollY + row.getBoundingClientRect().top - anchor.current.top);
      }

      lastScrollY.current = window.scrollY;
      requestAnimationFrame(() => (programmatic.current = false));
    };

    if (!following.current && appended && announceAdditions) setUnread((count) => count + appended);

    if (!announceAdditions) setUnread(0);
    restore();
    previous.current = identities;
    remember();

    const resize = new ResizeObserver(restore);

    if (record.current) resize.observe(record.current);

    if (content.current) resize.observe(content.current);

    return () => resize.disconnect();
  }, [identities.join('\u001f'), announceAdditions, remember]);

  return {
    record,
    content,
    following,
    anchor,
    atLatest,
    unread,
    setUnread,
    stopAt,
    jumpTo,
    jumpToStart,
    jumpToLatest,
  };
}
