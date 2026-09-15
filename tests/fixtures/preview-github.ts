import type { ExpectedRun, VerificationRecords } from '../../scripts/preview-github.ts';

export const head = '1111111111111111111111111111111111111111';

export const merge = '2222222222222222222222222222222222222222';

export const base = '3333333333333333333333333333333333333333';

const repository = { id: 42, full_name: 'TimothyKrell/agent-game' };

export const expected: ExpectedRun = {
  repository: repository.full_name,
  repositoryId: 42,
  runId: 100,
  attempt: 2,
};

// REST-shaped records: PR head and synthetic tested merge are intentionally distinct.
export function records(): VerificationRecords {
  const run = {
    id: 100,
    run_attempt: 2,
    workflow_id: 9,
    path: '.github/workflows/ci.yml',
    event: 'pull_request',
    status: 'completed',
    conclusion: 'success',
    head_sha: head,
    head_branch: 'feature',
    repository,
    head_repository: repository,
    pull_requests: [{ number: 27, head: { sha: head, repo: { id: 42 } }, base: { repo: { id: 42 } } }],
  };

  return {
    repository: { ...repository, default_branch: 'main' },
    workflow: { id: 9, path: '.github/workflows/ci.yml', state: 'active' },
    run,
    pr: {
      number: 27,
      state: 'open',
      head: { sha: head, ref: 'feature', repo: repository },
      base: { sha: base, ref: 'main', repo: repository },
    },
    jobs: [
      'Verify',
      'Unit and Worker tests (1/3)',
      'Unit and Worker tests (2/3)',
      'Unit and Worker tests (3/3)',
      'API and recovery tests',
      'Browser and motion tests',
      'Verify production provider transport',
    ].map((name, index) => ({
      id: 500 + index,
      name,
      run_id: 100,
      run_attempt: 2,
      head_sha: head,
      status: 'completed',
      conclusion: 'success',
      steps:
        name === 'Verify'
          ? [
              {
                name: `Preview identity v1 merge=${merge} base=${base} head=${head}`,
                number: 2,
                status: 'completed',
                conclusion: 'success',
              },
            ]
          : [],
    })),
    artifacts: [
      {
        id: 700,
        name: 'preview-bundle-100-2',
        size_in_bytes: 10000,
        expired: false,
        digest: `sha256:${'a'.repeat(64)}`,
        workflow_run: { id: 100, repository_id: 42, head_repository_id: 42, head_sha: head },
      },
    ],
    runs: [run],
    mergeCommit: merge,
    parents: [base, head],
    producerMatches: true,
  };
}
