import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { ArrowDown, LoaderCircle } from 'lucide-react';
import { useStickToBottom } from 'use-stick-to-bottom';
import type { StoryRow } from './succession-story-types';

export interface CodingRecordWindow {
  after: number;
  through: number;
  head: number;
  loading: boolean;
  error: string;
  following: boolean;
  setFollowing: (following: boolean) => void;
  loadEarlier: () => Promise<void>;
  loadLater: () => Promise<void>;
  loadLatest: () => Promise<void>;
  retry: () => Promise<void>;
}

/** A stable scroll surface: network state never unmounts the displayed conversation. */
export function CodingLiveRecord({
  rows,
  renderRow,
  history,
  live,
}: {
  rows: readonly StoryRow[];
  renderRow: (row: StoryRow) => ReactNode;
  history: CodingRecordWindow;
  live: boolean;
}) {
  const { scrollRef, contentRef, isAtBottom, scrollToBottom, stopScroll } = useStickToBottom({
    initial: 'instant',
    resize: 'instant',
  });

  const anchor = useRef<{ key: string; top: number } | null>(null);
  const latest = useRef(history);
  const paging = useRef(false);
  const position = useRef(0);
  latest.current = history;

  useEffect(() => {
    if (!isAtBottom) latest.current.setFollowing(false);
    else if (latest.current.following || latest.current.through === latest.current.head)
      latest.current.setFollowing(true);
  }, [isAtBottom]);

  useLayoutEffect(() => {
    if (!anchor.current || history.loading) return;
    const { key, top } = anchor.current;
    const row = scrollRef.current?.querySelector<HTMLElement>(`[data-event-key="${CSS.escape(key)}"]`);

    if (row && scrollRef.current) scrollRef.current.scrollTop += row.getBoundingClientRect().top - top;
    position.current = scrollRef.current?.scrollTop ?? 0;
    anchor.current = null;
  }, [history.through, history.loading, scrollRef]);

  const loadBoundary = async (direction: 'earlier' | 'later') => {
    if (paging.current || history.loading) return;
    paging.current = true;
    stopScroll();
    history.setFollowing(false);
    const viewport = scrollRef.current;

    const first =
      viewport &&
      Array.from(viewport.querySelectorAll<HTMLElement>('[data-event-key]')).find(
        (row) => row.getBoundingClientRect().bottom >= viewport.getBoundingClientRect().top,
      );

    if (first?.dataset.eventKey)
      anchor.current = { key: first.dataset.eventKey, top: first.getBoundingClientRect().top };

    try {
      await (direction === 'earlier' ? history.loadEarlier() : history.loadLater());
    } finally {
      paging.current = false;
    }
  };

  const latestActivity = async () => {
    await history.loadLatest();
    await scrollToBottom('instant');
  };

  return (
    <div className="cf-live-record">
      <div
        className="cf-feed-scroll"
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label="Match activity"
        aria-busy={history.loading}
        onScroll={(event) => {
          const viewport = event.currentTarget;
          const previous = position.current;
          position.current = viewport.scrollTop;

          if (anchor.current || history.error || paging.current || history.loading) return;

          if (viewport.scrollTop < previous && viewport.scrollTop <= 80 && history.after > 0)
            void loadBoundary('earlier');
          else if (
            viewport.scrollTop > previous &&
            viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 80 &&
            history.through < history.head &&
            !history.following
          )
            void loadBoundary('later');
        }}
      >
        <div ref={contentRef}>
          {history.after > 0 && (
            <div className="cf-feed-load">
              {history.loading ? 'Loading activity…' : 'Scroll up for earlier activity'}
            </div>
          )}
          <ol className="dossier-record">
            {rows.map((row) => {
              const content = renderRow(row);

              return content === null ? null : <li key={row.key}>{content}</li>;
            })}
          </ol>
          {!rows.length && (
            <p className="cf-feed-empty">
              {history.loading ? 'Loading match activity…' : 'The table is ready. Activity will appear here.'}
            </p>
          )}
          {history.through < history.head && !history.following && (
            <div className="cf-feed-load">
              {history.loading ? 'Loading activity…' : 'Scroll down for newer activity'}
            </div>
          )}
        </div>
      </div>
      <div className="cf-feed-status">
        <span role="status">
          {history.error ||
            (history.loading ? (
              <>
                <LoaderCircle size={12} className="spin" /> Updating
              </>
            ) : history.following && live ? (
              'Following live'
            ) : live ? (
              'Reading earlier activity'
            ) : (
              'Match record'
            ))}
        </span>
        {history.error && (
          <button disabled={history.loading} onClick={() => void history.retry()}>
            Retry activity
          </button>
        )}
        {(!isAtBottom || !history.following) && (
          <button onClick={() => void latestActivity()}>
            <ArrowDown size={14} />
            {live ? 'Jump to live' : 'Latest activity'}
            {live && history.head > history.through ? ` · ${history.head - history.through} new` : ''}
          </button>
        )}
      </div>
    </div>
  );
}
