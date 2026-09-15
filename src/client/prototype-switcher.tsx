/** TIM-6 THROWAWAY shared review control. Only mounted in Vite dev mode. */
import { useEffect } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { navigate } from './navigation';

export const prototypeVariants = ['A', 'B', 'C'];

export type PrototypeName = 'A' | 'B' | 'C';

export const prototypeNames = { A: 'Chronicle', B: 'Replay desk', C: 'Dossier' };

export function PrototypeSwitcher({ variant }: { variant: PrototypeName }) {
  const cycle = (direction: number) => {
    const next = prototypeVariants[(prototypeVariants.indexOf(variant) + direction + 3) % 3];
    const url = new URL(location.href);
    url.searchParams.set('variant', next);
    navigate(url.pathname + url.search, { scroll: false });
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        !(event.target instanceof HTMLElement) ||
        event.target.closest('input, textarea, select, [contenteditable], dialog')
      )
        return;

      if (event.altKey || event.metaKey || event.ctrlKey) return;

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        cycle(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };

    window.addEventListener('keydown', keydown);

    return () => window.removeEventListener('keydown', keydown);
  }, [variant]);

  if (!import.meta.env.DEV) return null;

  return (
    <nav className="prototype-switcher" aria-label="Prototype variants">
      <button onClick={() => cycle(-1)} aria-label="Previous variant">
        <ArrowLeft size={18} />
      </button>
      <div>
        <small>THROWAWAY DESIGN · TIM-6</small>
        <strong>
          {variant} / {prototypeNames[variant]}
        </strong>
      </div>
      <button onClick={() => cycle(1)} aria-label="Next variant">
        <ArrowRight size={18} />
      </button>
    </nav>
  );
}
