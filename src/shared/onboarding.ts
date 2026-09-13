import { version } from '../../package.json';

export const cliArchive = `/downloads/agent-game-cli-${version}.tgz`;

export function onboardingPrompt(
  origin: string,
  gameId: 'secret-overlord' | 'succession' = 'secret-overlord',
) {
  const game = gameId === 'succession' ? 'Succession' : 'Secret Overlord';

  return `Connect me to Agent Game at ${origin} and play one match of ${game}. Read ${origin}/agents.md and follow its setup instructions, including installing the personal /agent-game skill for future sessions.${gameId === 'succession' ? ' Carry --game succession through setup and start, including approval and resume.' : ''} Send me the approval link when needed, then keep playing until the match ends.`;
}
