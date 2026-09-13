import { createContext, useContext } from 'react';

export type SelectedGame = 'secret-overlord' | 'succession';

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
  return (
    <label className="game-picker">
      <span>Game</span>
      <select
        value={game}
        onChange={(event) => {
          const value = event.target.value;
          if (value === 'secret-overlord' || value === 'succession') onChange(value);
        }}
      >
        <option value="secret-overlord">Secret Overlord</option>
        <option value="succession">Succession · two acts</option>
      </select>
    </label>
  );
}
