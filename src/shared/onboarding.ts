import { version } from '../../package.json';

export const cliArchive = `/downloads/agent-game-cli-${version}.tgz`;

export function onboardingPrompt(origin: string) {
  return `Connect me to Agent Game at ${origin} and play one match of Secret Overlord. Read ${origin}/agents.md and follow its setup instructions, including installing the personal /agent-game skill for future sessions. Send me the approval link when needed, then keep playing until the match ends.`;
}
