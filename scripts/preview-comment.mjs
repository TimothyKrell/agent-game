import { execFileSync } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';

const { GITHUB_REPOSITORY: repository, PR_NUMBER: number, PREVIEW_URL: url } = process.env;

if (!repository || !/^[1-9]\d*$/.test(number ?? '') || !url?.startsWith('https://'))
  throw new Error('Set GITHUB_REPOSITORY, PR_NUMBER, and PREVIEW_URL.');

const status = process.argv[2];

if (!['deployed', 'removed'].includes(status)) throw new Error('Choose deployed or removed.');

const marker = '<!-- agent-game-preview -->';

const proof =
  status === 'deployed' ? JSON.parse(await readFile(process.env.PREVIEW_PROOF_PATH, 'utf8')) : undefined;

if (
  proof &&
  (String(proof.prNumber) !== number ||
    proof.repository !== repository ||
    proof.target.origin !== url ||
    !['not-configured', 'ready'].includes(proof.sourceRegistration.status) ||
    (proof.sourceRegistration.status === 'ready' &&
      (proof.sourceRegistration.readback !== 'verified' ||
        proof.sourceRegistration.commit !== proof.builtCommit ||
        !proof.sourceRegistration.sourceOrigin?.startsWith('https://') ||
        !/^[A-Za-z0-9_-]{8,100}$/.test(proof.sourceRegistration.incarnation))))
)
  throw new Error('Preview comment requires matching verified delivery provenance.');

const body =
  status === 'deployed'
    ? `${marker}\n## Agent Game scripted preview\n\n**[Open preview](${url})**\n\nVerified current PR head: \`${proof.prHeadSha}\`. Actual build / tested merge commit: \`${proof.builtCommit}\`.\n\n[CI run ${proof.runId}, attempt ${proof.runAttempt}](https://github.com/${repository}/actions/runs/${proof.runId}/attempts/${proof.runAttempt}); artifact \`${proof.artifactName}\` (ID ${proof.artifactId}). ZIP digest: \`${proof.artifactDigest}\`. Manifest SHA-256: \`${proof.manifestSha256}\`.\n\nIsolated Worker, D1, Durable Objects, R2 pictures and auth secret. Both scripted exhibition smoke checks passed; zero inference budget, accelerated time, ratings disabled. ${proof.sourceRegistration.status === 'ready' ? `Source-account registration is **ready**: the exact incarnation, built commit and artifact manifest were read back from [the source arena](${proof.sourceRegistration.sourceOrigin}) without deployer credentials. [Enter with your source account](${url}/preview). Paid broker play is **not configured**.` : 'Source-account registration and paid broker play are **not configured**.'}\n\nCurrent-head status was rechecked immediately before this comment. A new commit invalidates this build's current-head status; successful delivery updates this comment. Closing the PR retires source authority before removing its preview resources.`
    : `${marker}\n## Agent Game preview removed\n\nThe PR is closed. Its retained preview Worker, database, Durable Object game state, R2 picture bucket and auth secret have been removed.`;

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
