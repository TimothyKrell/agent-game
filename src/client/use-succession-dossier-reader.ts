import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { RefCallback } from 'react';
import { dossierTraversalDirection } from './dossier-navigation-intent';

export type DossierAct = 1 | 2;

export type DossierActEdge = 'start' | 'end';

export interface DossierActNavigation {
  /** Resolves only after the requested bounded edge window has been committed. */
  onNavigate: (edge: DossierActEdge) => Promise<void>;
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

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
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
  const navigationTicket = useRef(0);
  const latestNavigation = useRef(navigation);
  const latestSetOpen = useRef(setOpen);
  latestNavigation.current = navigation;
  latestSetOpen.current = setOpen;
  const [pendingJump, setPendingJump] = useState<PendingJump | null>(null);
  const [navigationError, setNavigationError] = useState('');

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

  const jump = useCallback((act: DossierAct, edge: DossierActEdge) => {
    setNavigationError('');
    setPendingJump({ act, edge });
  }, []);

  useLayoutEffect(() => {
    const anchor = pendingAnchor.current;

    if (anchor) {
      pendingAnchor.current = null;
      const heading = headings.current[anchor.act];

      if (heading) instantScrollBy(heading.getBoundingClientRect().top - anchor.top);
    }
  }, [open[1], open[2]]);

  useLayoutEffect(() => {
    if (!pendingJump) return;
    const { act, edge } = pendingJump;

    if (!open[act]) {
      latestSetOpen.current(act, true);

      return;
    }

    const ticket = ++navigationTicket.current;

    const navigate = async () => {
      // Opening a chapter enables its history reader in a passive effect. Wait
      // through the next frame before asking that reader to replace its window.
      await nextFrame();
      await latestNavigation.current?.[act]?.onNavigate(edge);
      // The external-store publication resolves before React is required to
      // commit its replacement rows. Position only after that commit frame.
      await nextFrame();

      if (ticket !== navigationTicket.current) return;
      performJump(act, edge);
      setPendingJump(null);
    };

    navigate().catch(() => {
      if (ticket !== navigationTicket.current) return;
      setPendingJump(null);
      setNavigationError('The record edge could not be loaded. Retry from this chapter.');
    });
  }, [open[1], open[2], pendingJump, performJump]);

  return { sectionRef, headingRef, endingRef, toggle, jump, pendingJump, navigationError };
}
