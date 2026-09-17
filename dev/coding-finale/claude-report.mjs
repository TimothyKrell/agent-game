import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Schema } from 'effect';

const root = resolve(process.argv[2]);

const agents = [];

const files = await readdir(root);

for (const name of files.filter((name) => /^bot-\d+$/.test(name))) {
  const directory = resolve(root, name);

  const lines = async (file) =>
    (await readFile(resolve(directory, file), 'utf8').catch(() => ''))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse);

  const tools = await lines('tools.jsonl');
  const events = await lines('usage.jsonl');
  const messages = new Map();

  for (const event of events) messages.set(event.messageId ?? `${event.stage}:${event.at}`, event);
  const waits = tools.filter((tool) => tool.command === 'wait');
  const results = {};

  for (const stage of ['readiness', 'game'])
    results[stage] = await readFile(resolve(directory, `${stage}-result.json`), 'utf8')
      .then(JSON.parse)
      .catch(() => null);

  const invocations = ['readiness', 'game'].map((stage) => {
    const delivered = [...messages.values()].filter((event) => event.stage === stage);

    const estimate = delivered.reduce((sum, event) => {
      const usage = event.usage;

      return (
        sum +
        ((usage?.input_tokens ?? 0) +
          2 * (usage?.cache_creation_input_tokens ?? 0) +
          0.1 * (usage?.cache_read_input_tokens ?? 0) +
          5 * (usage?.output_tokens ?? 0)) /
          1_000_000
      );
    }, 0);

    const reported =
      results[stage] === null
        ? null
        : Schema.decodeUnknownSync(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)))(
            results[stage].total_cost_usd,
          );

    return {
      stage,
      source: reported !== null ? 'completed-report' : 'stream-estimate',
      cost: reported !== null ? reported : estimate,
      deliveredModelCalls: delivered.length,
    };
  });

  agents.push({
    directory: name,
    modelCalls: messages.size,
    peakContext: Math.max(0, ...events.map((event) => event.context)),
    reportedCost: Object.values(results).reduce((sum, result) => sum + (result?.total_cost_usd ?? 0), 0),
    streamedCostEstimate: events.at(-1)?.estimatedCost ?? 0,
    finishedHarness: !!results.game,
    harnessOutcome: results.game?.subtype,
    invocations,
    usage: Object.fromEntries(
      ['inputTokens', 'outputTokens', 'cacheReadInputTokens', 'cacheCreationInputTokens'].map((key) => [
        key,
        Object.values(results).reduce(
          (sum, result) =>
            sum +
            Object.values(result?.modelUsage ?? {}).reduce((total, usage) => total + (usage[key] ?? 0), 0),
          0,
        ),
      ]),
    ),
    commands: Object.fromEntries(
      [...new Set(tools.map((tool) => tool.command))].map((command) => [
        command,
        tools.filter((tool) => tool.command === command).length,
      ]),
    ),
    errors: tools.filter((tool) => tool.error).map((tool) => ({ command: tool.command, error: tool.error })),
    waits: {
      count: waits.length,
      underOneSecond: waits.filter((tool) => tool.milliseconds < 1000).length,
      unchanged: waits.filter((tool) => tool.unchanged).length,
      totalMilliseconds: waits.reduce((sum, tool) => sum + tool.milliseconds, 0),
      bytes: waits.reduce((sum, tool) => sum + tool.bytes, 0),
    },
  });
}

const match = await readFile(resolve(root, 'result.json'), 'utf8')
  .then(JSON.parse)
  .catch(() => null);

const report = {
  complete: !!match && agents.every((agent) => agent.finishedHarness),
  matchId: match?.matchId,
  result: match?.result,
  submissions: match?.finale?.submissions,
  controllers: match?.seats.map((seat) => ({
    name: seat.name,
    control: seat.control,
    recoveryCount: seat.recoveryCount,
    forfeited: seat.forfeited,
  })),
  totals: {
    reconciledCost: agents.reduce(
      (sum, agent) => sum + agent.invocations.reduce((subtotal, invocation) => subtotal + invocation.cost, 0),
      0,
    ),
    reconciledCostScope:
      'One value per invocation: completed report when present, otherwise deduplicated delivered Haiku usage at the runner estimate rates. Missing final output or compaction usage remains unaccounted; this is not a verified invoice.',
    estimatedInvocations: agents.reduce(
      (sum, agent) =>
        sum + agent.invocations.filter((invocation) => invocation.source === 'stream-estimate').length,
      0,
    ),
    reportedCost: agents.reduce((sum, agent) => sum + agent.reportedCost, 0),
    reportedCostScope:
      'Completed harness invocations only; invocations without final reports have stream estimates only.',
    streamedCostEstimate: agents.reduce((sum, agent) => sum + agent.streamedCostEstimate, 0),
    modelCalls: agents.reduce((sum, agent) => sum + agent.modelCalls, 0),
    peakContext: Math.max(...agents.map((agent) => agent.peakContext)),
    waitCalls: agents.reduce((sum, agent) => sum + agent.waits.count, 0),
    fastWaits: agents.reduce((sum, agent) => sum + agent.waits.underOneSecond, 0),
    waitBytes: agents.reduce((sum, agent) => sum + agent.waits.bytes, 0),
    usage: Object.fromEntries(
      ['inputTokens', 'outputTokens', 'cacheReadInputTokens', 'cacheCreationInputTokens'].map((key) => [
        key,
        agents.reduce((sum, agent) => sum + agent.usage[key], 0),
      ]),
    ),
  },
  agents,
};

await writeFile(resolve(root, 'report.json'), JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));
