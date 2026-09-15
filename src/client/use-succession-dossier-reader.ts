import { useCallback, useLayoutEffect, useRef } from 'react';
import type { RefCallback } from 'react';
import { dossierTraversalDirection } from './dossier-navigation-intent';

export type DossierAct = 1 | 2;

export type DossierActEdge = 'start' | 'end';

export interface DossierActNavigation {
  /** Optional bounded-reader integration. The dossier still performs the visible document jump. */
  onNavigate?: (edge: DossierActEdge) => void | Promise<void>;
}

interface DossierReaderOptions {
  open: Readonly<Record<DossierAct, boolean>>;
  setOpen: (act: DossierAct, open: boolean) => void;
  navigation?: Partial<Record<DossierAct, DossierActNavigation>>;
}

interface PendingAnchor {
  act: DossierAct;
  top: number;
}

interface PendingJump {
  act: DossierAct;
  edge: DossierActEdge;
}

function instantScrollBy(top: number) {
  if (!dossierTraversalDirection(0, top)) return;
  window.scrollBy({ top, behavior: 'instant' });
}

/**
 * Coordinates the two bounded act windows as one document reader. It owns only
 * chapter/header movement; each timeline continues to own retrieval and row anchors.
 */
export function useSuccessionDossierReader({ open, setOpen, navigation }: DossierReaderOptions) {
  const sections = useRef<Record<DossierAct, HTMLElement | null>>({ 1: null, 2: null });
  const headings = useRef<Record<DossierAct, HTMLElement | null>>({ 1: null, 2: null });
  const endings = useRef<Record<DossierAct, HTMLElement | null>>({ 1: null, 2: null });
  const pendingAnchor = useRef<PendingAnchor | null>(null);
  const pendingJump = useRef<PendingJump | null>(null);

  const sectionRef = useCallback(
    (act: DossierAct): RefCallback<HTMLElement> =>
      (element) => {
        sections.current[act] = element;
      },
    [],
  );

  const headingRef = useCallback(
    (act: DossierAct): RefCallback<HTMLElement> =>
      (element) => {
        headings.current[act] = element;
      },
    [],
  );

  const endingRef = useCallback(
    (act: DossierAct): RefCallback<HTMLElement> =>
      (element) => {
        endings.current[act] = element;
      },
    [],
  );

  const toggle = useCallback(
    (act: DossierAct, next: boolean) => {
      const heading = headings.current[act];

      if (heading) pendingAnchor.current = { act, top: heading.getBoundingClientRect().top };
      setOpen(act, next);
    },
    [setOpen],
  );

  const performJump = useCallback((act: DossierAct, edge: DossierActEdge) => {
    const target = edge === 'start' ? headings.current[act] : endings.current[act];

    if (!target) return;
    target.scrollIntoView({ block: edge === 'start' ? 'start' : 'end', behavior: 'instant' });
  }, []);

  const jump = useCallback(
    (act: DossierAct, edge: DossierActEdge) => {
      void navigation?.[act]?.onNavigate?.(edge);

      if (!open[act]) {
        pendingJump.current = { act, edge };
        setOpen(act, true);

        return;
      }

      performJump(act, edge);
    },
    [navigation, open, performJump, setOpen],
  );

  useLayoutEffect(() => {
    const anchor = pendingAnchor.current;

    if (anchor) {
      pendingAnchor.current = null;
      const heading = headings.current[anchor.act];

      if (heading) instantScrollBy(heading.getBoundingClientRect().top - anchor.top);
    }

    const requested = pendingJump.current;

    if (requested && open[requested.act]) {
      pendingJump.current = null;
      performJump(requested.act, requested.edge);
    }
  }, [open[1], open[2], performJump]);

  return { sectionRef, headingRef, endingRef, toggle, jump };
}
