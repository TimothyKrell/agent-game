import { useId, useState } from 'react';
import type { GameId } from '../game/contracts';
import { navigate, useLocation } from './navigation';
import { useUnderlineMotion } from './motion';

export const gameNames = {
  'secret-overlord': 'Secret Overlord',
  succession: 'Succession',
};

export function gamePath(path: string, game: GameId, parameter = 'gameId'): string {
  const url = new URL(path, location.origin);

  if (game === 'secret-overlord') url.searchParams.delete(parameter);
  else url.searchParams.set(parameter, game);

  return `${url.pathname}${url.search}${url.hash}`;
}

/** A URL choice belongs only to its consuming page or section, never to shared navigation. */
export function usePageGame(parameter = 'gameId') {
  const url = new URL(useLocation());
  const value = url.searchParams.get(parameter);
  const game: GameId = value === 'succession' ? 'succession' : 'secret-overlord';

  return {
    game,
    explicit: value === 'secret-overlord' || value === 'succession',
    invalid: value !== null && value !== 'secret-overlord' && value !== 'succession',
    select: (next: GameId) => navigate(gamePath(location.href, next, parameter), { scroll: false }),
  };
}

type GameChoice = ReturnType<typeof usePageGame>;

export function GameSelect({ choice, label }: { choice: GameChoice; label: string }) {
  const id = useId();

  return (
    <div className="local-game-select">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={choice.invalid ? '' : choice.game}
        onChange={(event) => {
          if (event.target.value === 'secret-overlord' || event.target.value === 'succession')
            choice.select(event.target.value);
        }}
      >
        {choice.invalid && (
          <option value="" disabled>
            Choose a game
          </option>
        )}
        <option value="secret-overlord">Secret Overlord</option>
        <option value="succession">Succession</option>
      </select>
    </div>
  );
}

export function GameTabs({ choice, panelId }: { choice: GameChoice; panelId: string }) {
  const underline = useUnderlineMotion(choice.game);
  const [focused, setFocused] = useState(choice.game);

  return (
    <div className="rules-game-tabs" role="tablist" aria-label="Game rules" ref={underline}>
      {(['secret-overlord', 'succession'] as const).map((game, index) => (
        <button
          key={game}
          role="tab"
          className={!choice.invalid && choice.game === game ? 'selected' : undefined}
          id={`rules-tab-${game}`}
          aria-controls={panelId}
          aria-selected={!choice.invalid && choice.game === game}
          tabIndex={focused === game ? 0 : -1}
          onFocus={() => setFocused(game)}
          onClick={() => choice.select(game)}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            let next = 1 - index;

            if (event.key === 'Home') next = 0;

            if (event.key === 'End') next = 1;
            event.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus();
          }}
        >
          {gameNames[game]}
        </button>
      ))}
    </div>
  );
}
