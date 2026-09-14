import type { DialogueTrace } from './dialogue-baseline-worker';
import type { CapturedProviderRequest } from '../succession-provider-server';
import type { HouseJob } from '../../src/server/house-contract';

export function dialogueReport(trace: DialogueTrace, provider: CapturedProviderRequest[]) {
  const completed = new Set(trace.phases.map((phase) => phase.phaseId));

  const jobs = trace.houseJobs
    .map((row) => {
      const job: HouseJob = JSON.parse(row.data);
      const saved: { request: unknown } | null = row.response ? JSON.parse(row.response) : null;

      return { ...row, job, silent: saved !== null && saved.request === null };
    })
    .filter((row) => completed.has(row.job.phaseId));

  const coverage = trace.phases
    .filter((phase) => phase.eligible.length)
    .map((phase) => {
      const scheduled = trace.jobs.filter((job) => job.phaseId === phase.phaseId && job.kind === 'chat');

      const generated = jobs.filter(
        (row) => row.job.phaseId === phase.phaseId && row.job.kind === 'chat' && row.response !== null,
      );

      const submissions = trace.submissions.filter(
        (entry) => entry.job.phaseId === phase.phaseId && entry.type === 'chat',
      );

      const accepted = submissions.filter((entry) => entry.ok);
      const activated = [...new Set(generated.map((row) => row.job.seat))];
      const speakers = [...new Set(accepted.map((entry) => entry.job.seat))];

      const followupWanted = speakers.filter((seat) => {
        const first = accepted.find((entry) => entry.job.seat === seat)!;

        // Behavioral opportunity: a peer spoke after me, and my cooldown plus a 500ms
        // response budget fit before the actual engine phase closes (not a scheduler formula).
        return accepted.some(
          (entry) =>
            entry.job.seat !== seat &&
            entry.at > first.at &&
            Math.max(entry.at, first.at + 5000) + 500 < phase.deadline!,
        );
      });

      const followupReceived = speakers.filter(
        (seat) => accepted.filter((entry) => entry.job.seat === seat).length > 1,
      );

      const furtherReplyPossible = followupReceived.filter((seat) => {
        const last = accepted.findLast((entry) => entry.job.seat === seat)!;

        return accepted.some(
          (entry) =>
            entry.job.seat !== seat &&
            entry.at > last.at &&
            Math.max(entry.at, last.at + 5000) + 500 < phase.deadline!,
        );
      });

      return {
        ...phase,
        initial: scheduled.filter((job) => job.id.endsWith(':chat:0')).map((job) => job.seat),
        followup: scheduled.filter((job) => job.id.endsWith(':chat:1')).map((job) => job.seat),
        activated,
        speakers,
        followupWanted,
        missingFollowup: followupWanted.filter((seat) => !followupReceived.includes(seat)),
        furtherReplyPossible,
        accepted: accepted.length,
        rejected: submissions.length - accepted.length,
        silent: generated.filter((row) => row.silent).length,
        missing: phase.eligible.filter((seat) => !activated.includes(seat)),
      };
    });

  const reads = trace.reads.map((read, index) => {
    const request = provider[index];
    const latest = read.chat.at(-1);

    return {
      at: read.at,
      seat: read.seat,
      phaseId: read.phaseId,
      task: request?.prompt.task,
      recentChats: read.chat.length,
      promptChats: request?.prompt.chat.length ?? 0,
      latestAvailable: !!read.latestChat,
      recentHasLatest:
        !read.latestChat || (latest?.seat === read.latestChat.seat && latest.at === read.latestChat.at),
      promptHasRecentLatest:
        !latest ||
        request?.prompt.chat.some((entry) => entry.text === latest.text && entry.seat === latest.seat),
    };
  });

  const chatJobs = jobs.filter((row) => row.job.kind === 'chat');

  const samples = coverage.map((phase) => {
    const starts = trace.reads.filter((read) => read.phaseId === phase.phaseId);

    const sends = trace.submissions.filter(
      (entry) => entry.job.phaseId === phase.phaseId && entry.type === 'chat',
    );

    return {
      phaseId: phase.phaseId,
      act: phase.act,
      anchor: phase.anchor,
      activations: starts.map((read) => {
        const ordinal = starts.filter((entry) => entry.seat === read.seat && entry.at <= read.at).length;
        const send = sends.filter((entry) => entry.job.seat === read.seat)[ordinal - 1];

        const completed = jobs
          .filter(
            (row) => row.job.phaseId === phase.phaseId && row.job.seat === read.seat && row.response !== null,
          )
          .sort((a, b) => a.job.dueAt - b.job.dueAt)[ordinal - 1];

        return {
          seat: read.seat,
          ordinal,
          startMs: read.at - phase.start,
          dueMs: completed ? completed.job.dueAt - phase.start : null,
          deadlineSlackMs: completed ? completed.job.deadline - read.at : null,
          virtualResponseMs:
            completed?.completedAt !== null && completed?.completedAt !== undefined
              ? completed.completedAt - read.at
              : null,
          phaseSlackMs: send ? phase.deadline! - send.at : null,
        };
      }),
    };
  });

  const byAct = [1, 2].map((act) => {
    const phases = coverage.filter((phase) => phase.act === act);

    return {
      act,
      windows: phases.length,
      eligibleSeatWindows: phases.reduce((n, phase) => n + phase.eligible.length, 0),
      activatedSeatWindows: phases.reduce((n, phase) => n + phase.activated.length, 0),
      accepted: phases.reduce((n, phase) => n + phase.accepted, 0),
      followups: phases.reduce((n, phase) => n + phase.followup.length, 0),
      seats: Array.from({ length: 10 }, (_, seat) => ({
        seat,
        eligible: phases.filter((phase) => phase.eligible.includes(seat)).length,
        activated: phases.filter((phase) => phase.activated.includes(seat)).length,
        followup: phases.filter((phase) => phase.followup.includes(seat)).length,
      })),
    };
  });

  return {
    phases: trace.phases.length,
    virtualMs: trace.virtualMs,
    calls: provider.length,
    chatCalls: provider.filter((request) => request.prompt.task === 'chat').length,
    acceptedChat: trace.submissions.filter((entry) => entry.type === 'chat' && entry.ok).length,
    rejected: trace.submissions.filter((entry) => !entry.ok).length,
    silent: chatJobs.filter((row) => row.silent).length,
    doneWithoutResponse: chatJobs.filter((row) => row.status === 'done' && row.response === null).length,
    pendingChat: chatJobs.filter((row) => row.status !== 'done').length,
    drops: chatJobs
      .filter((row) => row.status === 'done' && row.response === null)
      .map((row) => ({
        id: row.job.id,
        seat: row.job.seat,
        phaseId: row.job.phaseId,
        deadline: row.job.deadline,
        completedAt: row.completedAt,
        attempts: row.attempts,
        expired: row.completedAt !== null && row.completedAt >= row.job.deadline,
      })),
    context: {
      reads: reads.length,
      recentMissingLatest: reads.filter((read) => !read.recentHasLatest).length,
      promptMissingRecentLatest: reads.filter((read) => !read.promptHasRecentLatest).length,
      maxPromptBytes: Math.max(0, ...provider.map((request) => request.promptBytes)),
    },
    byAct,
    coverage,
    samples,
    reads,
  };
}
