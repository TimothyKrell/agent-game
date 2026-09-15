import { Schema } from 'effect';
import { commitPattern, digestPattern, repositoryPattern, requireCondition } from './preview-artifact.ts';
import type { Manifest } from './preview-artifact.ts';

const Repository = Schema.Struct({ id: Schema.Number, full_name: Schema.String });

const Ref = Schema.Struct({ sha: Schema.String, ref: Schema.String, repo: Repository });

export const PullRequest = Schema.Struct({
  number: Schema.Number,
  state: Schema.String,
  head: Ref,
  base: Ref,
});

const RunPull = Schema.Struct({
  number: Schema.Number,
  head: Schema.Struct({ sha: Schema.String, repo: Schema.Struct({ id: Schema.Number }) }),
  base: Schema.Struct({ repo: Schema.Struct({ id: Schema.Number }) }),
});

export const Run = Schema.Struct({
  id: Schema.Number,
  workflow_id: Schema.Number,
  path: Schema.String,
  event: Schema.String,
  status: Schema.String,
  conclusion: Schema.NullOr(Schema.String),
  run_attempt: Schema.Number,
  head_sha: Schema.String,
  head_branch: Schema.String,
  repository: Repository,
  head_repository: Repository,
  pull_requests: Schema.Array(RunPull),
});

export const Job = Schema.Struct({
  id: Schema.Number,
  run_id: Schema.Number,
  run_attempt: Schema.Number,
  head_sha: Schema.String,
  name: Schema.String,
  status: Schema.String,
  conclusion: Schema.NullOr(Schema.String),
});

export const Artifact = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  size_in_bytes: Schema.Number,
  expired: Schema.Boolean,
  digest: Schema.String,
  workflow_run: Schema.Struct({
    id: Schema.Number,
    repository_id: Schema.Number,
    head_repository_id: Schema.Number,
    head_sha: Schema.String,
  }),
});

const Workflow = Schema.Struct({ id: Schema.Number, path: Schema.String, state: Schema.String });

const RepositoryInfo = Schema.Struct({
  id: Schema.Number,
  full_name: Schema.String,
  default_branch: Schema.String,
});

const BlobInfo = Schema.Struct({ sha: Schema.String, type: Schema.String });

export const requiredJobs = [
  'Verify',
  'Unit and Worker tests (1/3)',
  'Unit and Worker tests (2/3)',
  'Unit and Worker tests (3/3)',
  'API and recovery tests',
  'Browser and motion tests',
  'Verify production provider transport',
];

export const producerPaths = [
  '.github/workflows/ci.yml',
  '.github/actions/setup/action.yml',
  'scripts/produce-preview-artifact.ts',
  'scripts/preview-artifact.ts',
];

export const artifactName = (runId: number, attempt: number) => `preview-bundle-${runId}-${attempt}`;

export interface VerificationRecords {
  repository: typeof RepositoryInfo.Type;
  workflow: typeof Workflow.Type;
  run: typeof Run.Type;
  pr: typeof PullRequest.Type;
  jobs: readonly (typeof Job.Type)[];
  artifacts: readonly (typeof Artifact.Type)[];
  runs: readonly (typeof Run.Type)[];
  mergeCommit: string;
  parents: readonly string[];
  producerMatches: boolean;
}

export interface ExpectedRun {
  repository: string;
  repositoryId: number;
  runId: number;
  attempt: number;
}

export function verifyRecords(records: VerificationRecords, expected: ExpectedRun) {
  const { repository, workflow, run, pr } = records;
  requireCondition(
    repository.full_name === expected.repository && repository.id === expected.repositoryId,
    'Wrong repository',
  );
  requireCondition(
    run.repository.id === repository.id &&
      run.repository.full_name === repository.full_name &&
      run.head_repository.id === repository.id &&
      run.head_repository.full_name === repository.full_name,
    'Wrong run repository or fork',
  );
  requireCondition(
    run.id === expected.runId && run.run_attempt === expected.attempt,
    'Superseded run attempt',
  );
  requireCondition(
    run.event === 'pull_request' &&
      run.path === '.github/workflows/ci.yml' &&
      workflow.path === run.path &&
      workflow.state === 'active' &&
      run.workflow_id === workflow.id,
    'Wrong workflow/event/path',
  );
  requireCondition(run.status === 'completed' && run.conclusion === 'success', 'CI did not succeed');
  requireCondition(
    pr.state === 'open' &&
      pr.base.repo.id === repository.id &&
      pr.head.repo.id === repository.id &&
      pr.base.repo.full_name === repository.full_name &&
      pr.head.repo.full_name === repository.full_name &&
      pr.base.ref === repository.default_branch,
    'Closed, fork, or wrong-base PR',
  );
  requireCondition(
    Number.isSafeInteger(pr.number) && pr.number > 0 && run.pull_requests.length === 1,
    'Ambiguous run PR',
  );
  const association = run.pull_requests[0];
  requireCondition(
    association.number === pr.number &&
      association.head.sha === pr.head.sha &&
      association.head.repo.id === repository.id &&
      association.base.repo.id === repository.id &&
      run.head_branch === pr.head.ref,
    'Superseded PR head or wrong association',
  );
  requireCondition(
    [pr.head.sha, records.mergeCommit, run.head_sha].every((sha) => commitPattern.test(sha)),
    'Invalid commit SHA',
  );
  requireCondition(
    records.mergeCommit !== pr.head.sha &&
      records.parents.length === 2 &&
      records.parents[0] === pr.base.sha &&
      records.parents[1] === pr.head.sha,
    'Invalid tested merge ancestry',
  );
  // REST run/job head_sha is the PR head on GitHub PR runs; preserve it separately
  // from the synthetic merge checkout. Some API records report the merge SHA.
  requireCondition(run.head_sha === pr.head.sha || run.head_sha === records.mergeCommit, 'Wrong run head');
  requireCondition(records.producerMatches, 'CI producer/workflow differs from trusted default branch');
  requireCondition(
    records.runs.some((candidate) => candidate.id === run.id && candidate.run_attempt === run.run_attempt),
    'Current run missing from GitHub inventory',
  );
  requireCondition(
    !records.runs.some(
      (candidate) =>
        candidate.workflow_id === workflow.id &&
        candidate.event === 'pull_request' &&
        candidate.head_repository.id === repository.id &&
        candidate.pull_requests.some((item) => item.number === pr.number) &&
        (candidate.id > run.id || (candidate.id === run.id && candidate.run_attempt > run.run_attempt)),
    ),
    'Newer CI run exists',
  );

  for (const name of requiredJobs) {
    const jobs = records.jobs.filter((job) => job.name === name);
    requireCondition(jobs.length === 1, `Missing/duplicate required job: ${name}`);
    const job = jobs[0];
    requireCondition(
      job.run_id === run.id &&
        job.run_attempt === run.run_attempt &&
        job.head_sha === run.head_sha &&
        job.status === 'completed' &&
        job.conclusion === 'success',
      `Required job not successful in current attempt: ${name}`,
    );
  }

  const artifacts = records.artifacts.filter(
    (artifact) => artifact.name === artifactName(run.id, run.run_attempt),
  );

  requireCondition(artifacts.length === 1, 'Missing/duplicate build artifact');
  const artifact = artifacts[0];
  requireCondition(
    Number.isSafeInteger(artifact.id) &&
      artifact.id > 0 &&
      !artifact.expired &&
      artifact.size_in_bytes > 0 &&
      artifact.size_in_bytes <= 110 * 1024 * 1024 &&
      artifact.digest.startsWith('sha256:') &&
      digestPattern.test(artifact.digest.slice(7)),
    'Invalid/expired artifact metadata',
  );
  requireCondition(
    artifact.workflow_run.id === run.id &&
      artifact.workflow_run.repository_id === repository.id &&
      artifact.workflow_run.head_repository_id === repository.id &&
      artifact.workflow_run.head_sha === run.head_sha,
    'Artifact belongs to another run',
  );

  return {
    repository: repository.full_name,
    repositoryId: repository.id,
    prNumber: pr.number,
    prHeadSha: pr.head.sha,
    builtCommit: records.mergeCommit,
    runHeadSha: run.head_sha,
    runId: run.id,
    runAttempt: run.run_attempt,
    artifactId: artifact.id,
    artifactName: artifact.name,
    artifactDigest: artifact.digest,
    workflowId: workflow.id,
    jobs: records.jobs
      .filter((job) => requiredJobs.includes(job.name))
      .map((job) => ({ id: job.id, name: job.name })),
  };
}

export type VerifiedRun = ReturnType<typeof verifyRecords>;

export function verifyManifestIdentity(manifest: Manifest, verified: VerifiedRun) {
  requireCondition(
    manifest.repository === verified.repository &&
      manifest.runId === verified.runId &&
      manifest.runAttempt === verified.runAttempt &&
      manifest.prHeadSha === verified.prHeadSha &&
      manifest.builtCommit === verified.builtCommit,
    'Manifest provenance does not match GitHub',
  );
}

export class GitHub {
  readonly repository: string;
  private readonly token: string;
  private readonly fetcher: typeof fetch;

  constructor(repository: string, token: string, fetcher: typeof fetch = fetch) {
    requireCondition(repositoryPattern.test(repository), 'Invalid repository');
    this.repository = repository;
    this.token = token;
    this.fetcher = fetcher;
  }
  async request(path: string, options: RequestInit = {}) {
    requireCondition(
      path.startsWith(`repos/${this.repository}/`) || path === `repos/${this.repository}`,
      'Unexpected GitHub API path',
    );

    const response = await this.fetcher(`https://api.github.com/${path}`, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...options.headers,
      },
    });

    requireCondition(response.ok, `GitHub API ${response.status}: ${path}`);

    return response;
  }
  async json(path: string) {
    const response = await this.request(path);

    return JSON.parse((await boundedResponse(response, 8 * 1024 * 1024)).toString('utf8'));
  }
  async verify(expected: ExpectedRun, controllerCommit: string) {
    requireCondition(commitPattern.test(controllerCommit), 'Invalid controller commit');
    const prefix = `repos/${this.repository}`;

    const [repository, workflow, run] = await Promise.all([
      this.json(prefix).then(Schema.decodeUnknownSync(RepositoryInfo)),
      this.json(`${prefix}/actions/workflows/ci.yml`).then(Schema.decodeUnknownSync(Workflow)),
      this.json(`${prefix}/actions/runs/${expected.runId}`).then(Schema.decodeUnknownSync(Run)),
    ]);

    requireCondition(
      run.pull_requests.length === 1 &&
        Number.isSafeInteger(run.pull_requests[0].number) &&
        run.pull_requests[0].number > 0,
      'Ambiguous run PR',
    );

    const pr = Schema.decodeUnknownSync(PullRequest)(
      await this.json(`${prefix}/pulls/${run.pull_requests[0].number}`),
    );

    requireCondition(commitPattern.test(pr.head.sha), 'Invalid PR head');

    const merge = Schema.decodeUnknownSync(Schema.Struct({ object: Schema.Struct({ sha: Schema.String }) }))(
      await this.json(`${prefix}/git/ref/pull/${pr.number}/merge`),
    ).object.sha;

    requireCondition(commitPattern.test(merge), 'Invalid merge ref');

    const parents = Schema.decodeUnknownSync(
      Schema.Struct({ parents: Schema.Array(Schema.Struct({ sha: Schema.String })) }),
    )(await this.json(`${prefix}/git/commits/${merge}`)).parents.map((parent) => parent.sha);

    // Finite inventories fail closed at the page boundary instead of silently
    // accepting a truncated list. Current CI has < 20 jobs/artifacts.
    const [jobs, artifacts, runs, blobs] = await Promise.all([
      this.json(`${prefix}/actions/runs/${run.id}/attempts/${expected.attempt}/jobs?per_page=100`).then(
        Schema.decodeUnknownSync(Schema.Struct({ total_count: Schema.Number, jobs: Schema.Array(Job) })),
      ),
      this.json(`${prefix}/actions/runs/${run.id}/artifacts?per_page=100`).then(
        Schema.decodeUnknownSync(
          Schema.Struct({ total_count: Schema.Number, artifacts: Schema.Array(Artifact) }),
        ),
      ),
      this.json(
        `${prefix}/actions/workflows/${workflow.id}/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=100`,
      ).then(
        Schema.decodeUnknownSync(
          Schema.Struct({ total_count: Schema.Number, workflow_runs: Schema.Array(Run) }),
        ),
      ),
      Promise.all(
        producerPaths.map(async (path) => {
          const [trusted, built] = await Promise.all(
            [controllerCommit, merge].map(async (ref) =>
              Schema.decodeUnknownSync(BlobInfo)(await this.json(`${prefix}/contents/${path}?ref=${ref}`)),
            ),
          );

          return trusted.type === 'file' && built.type === 'file' && trusted.sha === built.sha;
        }),
      ),
    ]);

    requireCondition(
      jobs.total_count === jobs.jobs.length &&
        artifacts.total_count === artifacts.artifacts.length &&
        runs.total_count === runs.workflow_runs.length &&
        [jobs.total_count, artifacts.total_count, runs.total_count].every((n) => n < 100),
      'Truncated GitHub inventory',
    );

    return verifyRecords(
      {
        repository,
        workflow,
        run,
        pr,
        jobs: jobs.jobs,
        artifacts: artifacts.artifacts,
        runs: runs.workflow_runs,
        mergeCommit: merge,
        parents,
        producerMatches: blobs.every(Boolean),
      },
      expected,
    );
  }
  async download(verified: VerifiedRun) {
    const response = await this.fetcher(
      `https://api.github.com/repos/${this.repository}/actions/artifacts/${verified.artifactId}/zip`,
      {
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
        headers: { authorization: `Bearer ${this.token}`, 'X-GitHub-Api-Version': '2022-11-28' },
      },
    );

    requireCondition(response.status === 302, 'Expected signed artifact download redirect');
    const location = new URL(response.headers.get('location') ?? '');
    requireCondition(
      location.protocol === 'https:' && !location.username && !location.password,
      'Invalid artifact download URL',
    );
    // Deliberately do not forward GitHub credentials to blob storage.
    const archive = await this.fetcher(location, { redirect: 'error', signal: AbortSignal.timeout(120_000) });
    requireCondition(archive.ok, 'Artifact download failed');

    return boundedResponse(archive, 110 * 1024 * 1024);
  }
}

export async function boundedResponse(response: Response, maximum: number) {
  requireCondition(Number(response.headers.get('content-length') ?? 0) <= maximum, 'Response too large');
  requireCondition(response.body !== null, 'Missing response body');
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) break;
      total += value.length;
      requireCondition(total <= maximum, 'Response too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }

  return Buffer.concat(chunks);
}
