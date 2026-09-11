import { execFileSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';

const { GITHUB_REPOSITORY: repository, PR_NUMBER: number, PREVIEW_URL: url } = process.env;

if (!repository || !/^[1-9]\d*$/.test(number ?? '') || !url?.startsWith('https://'))
  throw new Error('Set GITHUB_REPOSITORY, PR_NUMBER, and PREVIEW_URL.');

const status = process.argv[2];

if (!['deployed', 'removed'].includes(status)) throw new Error('Choose deployed or removed.');

const marker = '<!-- agent-game-preview -->';

const body =
  status === 'deployed'
    ? `${marker}\n## Agent Game preview\n\n**[Open preview](${url})**\n\nBuilt from ${process.env.PR_HEAD_SHA}. Isolated database and game state; scripted, unranked exhibitions. OAuth sign-in is exercised locally and in production.\n\nThis preview is updated on new commits and removed when the PR closes.`
    : `${marker}\n## Agent Game preview removed\n\nThe PR is closed. Its Worker, database, and game state have been deleted.`;

const pages = JSON.parse(
  execFileSync('gh', ['api', '--paginate', '--slurp', `repos/${repository}/issues/${number}/comments`], {
    encoding: 'utf8',
  }),
);

const existing = pages
  .flat()
  .find((comment) => comment.user.login === 'github-actions[bot]' && comment.body.includes(marker));

const endpoint = existing
  ? `repos/${repository}/issues/comments/${existing.id}`
  : `repos/${repository}/issues/${number}/comments`;

execFileSync('gh', ['api', '--method', existing ? 'PATCH' : 'POST', endpoint, '--input', '-'], {
  input: JSON.stringify({ body }),
  stdio: ['pipe', 'ignore', 'inherit'],
});

if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, body + '\n');
