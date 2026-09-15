import { describe, expect, it } from 'vitest';
import { GitHub, verifyRecords, verifyManifestIdentity, boundedResponse } from '../scripts/preview-github.ts';
import type { VerificationRecords } from '../scripts/preview-github.ts';
import { deliveryProof, previewTarget } from '../scripts/preview-controller.ts';
import { records, expected, base, head, merge } from './fixtures/preview-github';

describe('trusted GitHub delivery eligibility', () => {
  it('records the tested merge separately from the PR/run head, with a reserved source-registration seam', () => {
    const verified = verifyRecords(records(), expected);
    expect(deliveryProof(verified, 'b'.repeat(64), base, 'tk-d86')).toMatchObject({
      prNumber: 27,
      prHeadSha: head,
      runHeadSha: head,
      builtCommit: merge,
      artifactId: 700,
      runId: 100,
      runAttempt: 2,
      controllerCommit: base,
      target: {
        stage: 'pr-27',
        workerName: 'agent-game-pr-27',
        origin: 'https://agent-game-pr-27.tk-d86.workers.dev',
        policy: 'scripted-zero-budget-unranked',
      },
      sourceRegistration: { status: 'not-configured' },
    });
    expect(() => previewTarget(-1, 'tk-d86')).toThrow();
    expect(() => previewTarget(27, 'other.invalid/path')).toThrow();
    expect(() =>
      verifyManifestIdentity(
        {
          version: 1,
          repository: expected.repository,
          runId: 100,
          runAttempt: 2,
          prHeadSha: head,
          builtCommit: head,
          entry: 'worker/worker.js',
          files: [],
        },
        verified,
      ),
    ).toThrow('provenance');
  });

  const rejected: [string, (record: VerificationRecords) => void][] = [
    [
      'wrong repository',
      (r) => {
        r.repository = { ...r.repository, id: 43 };
      },
    ],
    [
      'fork',
      (r) => {
        r.run = { ...r.run, head_repository: { id: 43, full_name: 'attacker/agent-game' } };
      },
    ],
    [
      'wrong event',
      (r) => {
        r.run = { ...r.run, event: 'workflow_dispatch' };
      },
    ],
    [
      'same workflow name, different path',
      (r) => {
        r.run = { ...r.run, path: '.github/workflows/evil.yml' };
      },
    ],
    [
      'failed run',
      (r) => {
        r.run = { ...r.run, conclusion: 'failure' };
      },
    ],
    [
      'pending run',
      (r) => {
        r.run = { ...r.run, status: 'in_progress' };
      },
    ],
    [
      'rerun attempt',
      (r) => {
        r.run = { ...r.run, run_attempt: 3 };
      },
    ],
    [
      'closed PR',
      (r) => {
        r.pr = { ...r.pr, state: 'closed' };
      },
    ],
    [
      'superseded PR head',
      (r) => {
        r.pr = { ...r.pr, head: { ...r.pr.head, sha: base } };
      },
    ],
    [
      'wrong merge ancestry',
      (r) => {
        r.parents = [base, base];
      },
    ],
    [
      'changed CI producer',
      (r) => {
        r.producerMatches = false;
      },
    ],
    [
      'missing required job',
      (r) => {
        r.jobs = r.jobs.slice(0, -1);
      },
    ],
    [
      'skipped required job',
      (r) => {
        r.jobs = r.jobs.map((j, i) => (i ? j : { ...j, conclusion: 'skipped' }));
      },
    ],
    [
      'failed required job',
      (r) => {
        r.jobs = r.jobs.map((j, i) => (i ? j : { ...j, conclusion: 'failure' }));
      },
    ],
    [
      'old-attempt required job',
      (r) => {
        r.jobs = r.jobs.map((j, i) => (i ? j : { ...j, run_attempt: 1 }));
      },
    ],
    [
      'duplicate job',
      (r) => {
        r.jobs = [...r.jobs, r.jobs[0]];
      },
    ],
    [
      'wrong job head',
      (r) => {
        r.jobs = r.jobs.map((j, i) => (i ? j : { ...j, head_sha: base }));
      },
    ],
    [
      'newer failed CI',
      (r) => {
        r.runs = [...r.runs, { ...r.run, id: 101, conclusion: 'failure' }];
      },
    ],
    [
      'duplicate artifacts',
      (r) => {
        r.artifacts = [...r.artifacts, { ...r.artifacts[0], id: 701 }];
      },
    ],
    [
      'old artifact attempt',
      (r) => {
        r.artifacts = [{ ...r.artifacts[0], name: 'preview-bundle-100-1' }];
      },
    ],
    [
      'expired artifact',
      (r) => {
        r.artifacts = [{ ...r.artifacts[0], expired: true }];
      },
    ],
    [
      'wrong artifact run',
      (r) => {
        r.artifacts = [{ ...r.artifacts[0], workflow_run: { ...r.artifacts[0].workflow_run, id: 99 } }];
      },
    ],
    [
      'missing artifact digest',
      (r) => {
        r.artifacts = [{ ...r.artifacts[0], digest: '' }];
      },
    ],
    [
      'oversize artifact',
      (r) => {
        r.artifacts = [{ ...r.artifacts[0], size_in_bytes: 200 * 1024 * 1024 }];
      },
    ],
  ];

  it.each(rejected)('rejects %s', (_name, change) => {
    const record = records();
    change(record);
    expect(() => verifyRecords(record, expected)).toThrow();
  });

  it('queries live API inventories again, rejecting a synchronization between checks', async () => {
    const record = records();
    const paths: string[] = [];

    const fetcher: typeof fetch = async (url) => {
      const path = new URL(String(url)).pathname.replace('/repos/TimothyKrell/agent-game', '');
      paths.push(path);

      const responses = new Map<string, object>([
        ['', record.repository],
        ['/actions/workflows/ci.yml', record.workflow],
        ['/actions/runs/100', record.run],
        ['/pulls/27', record.pr],
        ['/git/ref/pull/27/merge', { object: { sha: merge } }],
        [`/git/commits/${merge}`, { parents: record.parents.map((sha) => ({ sha })) }],
        ['/actions/runs/100/attempts/2/jobs', { total_count: record.jobs.length, jobs: record.jobs }],
        [
          '/actions/runs/100/artifacts',
          { total_count: record.artifacts.length, artifacts: record.artifacts },
        ],
        ['/actions/workflows/9/runs', { total_count: record.runs.length, workflow_runs: record.runs }],
      ]);

      if (path.startsWith('/contents/')) return Response.json({ sha: base, type: 'file' });

      if (!responses.has(path)) throw new Error(`Unexpected API call: ${path}`);

      return Response.json(responses.get(path));
    };

    const api = new GitHub(expected.repository, 'synthetic-github-token', fetcher);
    expect((await api.verify(expected, base)).builtCommit).toBe(merge);
    record.pr = { ...record.pr, head: { ...record.pr.head, sha: base } };
    await expect(api.verify(expected, base)).rejects.toThrow();
    expect(paths.filter((path) => path === '/pulls/27')).toHaveLength(2);
    expect(paths).toContain('/actions/runs/100/attempts/2/jobs');
  });

  it('uses the exact artifact ID and never forwards the GitHub token to blob storage', async () => {
    const seen: { url: string; authorization: string | null }[] = [];

    const api = new GitHub(expected.repository, 'synthetic-github-token', async (url, init) => {
      seen.push({ url: String(url), authorization: new Headers(init?.headers).get('authorization') });

      return seen.length === 1
        ? new Response(null, {
            status: 302,
            headers: { location: 'https://blob.example/artifact?signature=test' },
          })
        : new Response('zip bytes');
    });

    expect((await api.download(verifyRecords(records(), expected))).toString()).toBe('zip bytes');
    expect(seen).toEqual([
      {
        url: 'https://api.github.com/repos/TimothyKrell/agent-game/actions/artifacts/700/zip',
        authorization: 'Bearer synthetic-github-token',
      },
      { url: 'https://blob.example/artifact?signature=test', authorization: null },
    ]);
    await expect(boundedResponse(new Response('oversize'), 2)).rejects.toThrow('too large');
  });
});
