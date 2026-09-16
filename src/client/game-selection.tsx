import { useId, useState } from 'react';
import type { GameId } from '../game/contracts';
import { navigate, useLocation } from './navigation';
import { useUnderlineMotion } from './motion';

export const gameNames = {
  'secret-overlord': 'Secret Overlord',
  succession: 'Succession',
  'coding-finale': 'Coding Finale',
};

const pageGames = ['coding-finale', 'secret-overlord', 'succession'] as const;

function isPageGame(value: string | null): value is GameId {
  return value !== null && pageGames.some((game) => game === value);
}

export function gamePath(path: string, game: GameId, parameter = 'gameId'): string {
  const url = new URL(path, location.origin);

  if (game === 'coding-finale') url.searchParams.delete(parameter);
  else url.searchParams.set(parameter, game);

  return `${url.pathname}${url.search}${url.hash}`;
}

/** A URL choice belongs only to its consuming page or section, never to shared navigation. */
export function usePageGame(parameter = 'gameId') {
  const url = new URL(useLocation());
  const value = url.searchParams.get(parameter);
  const explicit = isPageGame(value);
  const game: GameId = explicit ? value : 'coding-finale';

  return {
    game,
    explicit,
    invalid: value !== null && !explicit,
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
          const game = event.target.value;

          if (isPageGame(game)) choice.select(game);
        }}
      >
        {choice.invalid && (
          <option value="" disabled>
            Choose a game
          </option>
        )}
        {pageGames.map((game) => (
          <option value={game} key={game}>
            {gameNames[game]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function GameTabs({ choice, panelId }: { choice: GameChoice; panelId: string }) {
  const underline = useUnderlineMotion(choice.game);
  const [focused, setFocused] = useState(choice.game);

  return (
    <div className="rules-game-tabs" role="tablist" aria-label="Game rules" ref={underline}>
      {pageGames.map((game, index) => (
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
            let next = event.key === 'ArrowLeft' ? index - 1 : index + 1;

            if (event.key === 'Home') next = 0;

            if (event.key === 'End') next = pageGames.length - 1;
            next = (next + pageGames.length) % pageGames.length;
            event.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus();
          }}
        >
          {gameNames[game]}
        </button>
      ))}
    </div>
  );
}
