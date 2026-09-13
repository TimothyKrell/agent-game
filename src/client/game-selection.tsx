import { createContext, useContext } from 'react';
import type { GameId } from '../game/contracts';
import { Check } from 'lucide-react';
import { useUnderlineMotion } from './motion';

export type SelectedGame = GameId;

export const GameSelection = createContext<SelectedGame>('secret-overlord');

export const gameNames = {
  'secret-overlord': 'Secret Overlord',
  succession: 'Succession',
};

export function useSelectedGame() {
  return useContext(GameSelection);
}

export function selectedGame(search: string): SelectedGame | null {
  const value = new URLSearchParams(search).get('gameId');

  if (value === null || value === 'secret-overlord') return 'secret-overlord';

  return value === 'succession' ? value : null;
}

export function gamePath(path: string, game: SelectedGame): string {
  const url = new URL(path, location.origin);

  if (game === 'secret-overlord') url.searchParams.delete('gameId');
  else url.searchParams.set('gameId', game);

  return `${url.pathname}${url.search}${url.hash}`;
}

export function GamePicker({
  game,
  onChange,
}: {
  game: SelectedGame;
  onChange: (game: SelectedGame) => void;
}) {
  const underline = useUnderlineMotion(game);

  return (
    <div className="game-scope">
      <span className="eyebrow">GAME</span>
      <div className="game-picker" ref={underline} aria-label="Choose a game">
        {(['secret-overlord', 'succession'] as const).map((value) => (
          <button
            key={value}
            className="button"
            aria-pressed={game === value}
            onClick={() => onChange(value)}
          >
            {game === value && <Check size={16} />}
            <span>{gameNames[value]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
