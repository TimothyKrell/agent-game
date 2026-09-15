import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { expect, it, vi } from 'vitest';
import { invokeHarness, type Invocation } from '../cli/supervisor.mjs';

async function nativeFixture(harness: string, script: string) {
  const directory = await mkdtemp('/tmp/opencode/supervisor-native-');
  await writeFile(
    `${directory}/${harness === 'claude' ? 'claude' : 'opencode2'}`,
    `#!${process.execPath}\n${script}`,
    { mode: 0o700 },
  );
  vi.stubEnv('PATH', `${directory}:${process.env.PATH}`);
  const controller = new AbortController();
  const usage: number[] = [];

  const input: Invocation = {
    harness,
    prompt: 'synthetic no inference',
    runDir: directory,
    sessionId: 'ses_test',
    remainingBudget: harness === 'claude' ? 1.25 : null,
    remainingRuntimeMs: 1000,
    deadline: Date.now() + 1000,
    signal: controller.signal,
    onEvent: () => {},
    onSession: async () => {},
    onUsage: async (report) => {
      usage.push(report.total);
    },
  };

  return { directory, controller, input, usage };
}

it('passes the reserved native Claude budget and accounts final per-invocation dollars', async () => {
  const f = await nativeFixture(
    'claude',
    `const fs=require('node:fs'); fs.writeFileSync('arguments.json',JSON.stringify(process.argv.slice(2))); console.log(JSON.stringify({type:'result',subtype:'success',session_id:'ses_test',total_cost_usd:0.25}));`,
  );

  try {
    const result = await invokeHarness(f.input);
    const args = JSON.parse(await readFile(`${f.directory}/arguments.json`, 'utf8'));
    expect(args[args.indexOf('--max-budget-usd') + 1]).toBe('1.25');
    expect(result.exitCode).toBe(0);
    expect(f.usage).toEqual([0.25]);
  } finally {
    vi.unstubAllEnvs();
  }
});

it('interrupts the actual OpenCode V2 session API rather than only terminating its run client', async () => {
  const f = await nativeFixture(
    'opencode',
    `const fs=require('node:fs'); if(process.argv[2]==='api'){if(process.argv[3]==='post'){fs.writeFileSync('interrupt.json',JSON.stringify(process.argv.slice(2))); console.log(JSON.stringify({data:{interrupted:true}}));}else console.log(JSON.stringify({data:{id:'ses_test',cost:0.4,time:{idle:Date.now()}}}));}else{fs.writeFileSync('ready','yes'); setInterval(()=>{},1000);}`,
  );

  try {
    const task = invokeHarness(f.input);

    for (let tries = 0; tries < 100; tries++) {
      try {
        await readFile(`${f.directory}/ready`);
        break;
      } catch {
        await sleep(5);
      }
    }

    f.controller.abort();
    await task;
    const args = JSON.parse(await readFile(`${f.directory}/interrupt.json`, 'utf8'));
    expect(args).toEqual(['api', 'post', '/api/session/ses_test/interrupt']);
    expect(f.usage).toEqual([0.4]);
  } finally {
    vi.unstubAllEnvs();
  }
});

it('kills a native child and its foreground descendant tools at the absolute deadline', async () => {
  const f = await nativeFixture(
    'claude',
    `const cp=require('node:child_process'),fs=require('node:fs'); const child=cp.spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'inherit'});fs.writeFileSync('pids.json',JSON.stringify([process.pid,child.pid]));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`,
  );

  f.input.deadline = Date.now() + 300;

  try {
    const task = invokeHarness(f.input);
    await sleep(100);
    f.controller.abort();
    await task;
    const pids = JSON.parse(await readFile(`${f.directory}/pids.json`, 'utf8'));

    // Linux can retain a reparented zombie briefly; it has no live tool execution.
    for (const pid of pids) {
      try {
        const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
        expect(stat.split(' ')[2]).toBe('Z');
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
    }

    expect(Date.now()).toBeLessThan(f.input.deadline + 500);
  } finally {
    vi.unstubAllEnvs();
  }
});

it.each(['claude', 'opencode'])(
  'runs the native %s API with a fractional absolute deadline without argument-validation retries',
  async (harness) => {
    const f = await nativeFixture(
      harness,
      `const fs=require('node:fs'); const args=process.argv.slice(2); fs.appendFileSync('native-calls.jsonl',JSON.stringify(args)+'\\n'); if(args[0]==='api'){ const data=args[1]==='post'?{id:'ses_fractional',location:{directory:process.cwd()}}:{id:'ses_fractional',cost:0.125,time:{idle:Date.now()}};console.log(JSON.stringify({data})); }else{fs.writeFileSync('native-deadline',process.env.AGENT_GAME_CHILD_DEADLINE);console.log(JSON.stringify({type:'result',subtype:'success',session_id:'ses_fractional',total_cost_usd:0.125}));}`,
    );

    f.input.sessionId = undefined;
    f.input.deadline = Date.now() + 5000.875;
    f.input.remainingRuntimeMs = 10000;

    try {
      expect(await invokeHarness(f.input)).toMatchObject({ exitCode: 0, sessionId: 'ses_fractional' });
      expect(f.usage).toEqual([0.125]);
      expect(Number(await readFile(`${f.directory}/native-deadline`, 'utf8'))).toBe(f.input.deadline);

      const calls = (await readFile(`${f.directory}/native-calls.jsonl`, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));

      expect(calls).toHaveLength(harness === 'opencode' ? 3 : 1);
    } finally {
      vi.unstubAllEnvs();
    }
  },
);

for (const remaining of [-1, 0.75]) {
  it.each(['claude', 'opencode'])(
    `expires a native %s invocation with ${remaining}ms left before spawning`,
    async (harness) => {
      const f = await nativeFixture(harness, `require('node:fs').writeFileSync('unexpected-spawn','yes');`);
      const now = Date.now();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
      f.input.sessionId = undefined;
      f.input.deadline = now + remaining;

      try {
        expect(await invokeHarness(f.input)).toMatchObject({ outcome: 'runtime-exhausted' });
        await expect(readFile(`${f.directory}/unexpected-spawn`)).rejects.toMatchObject({ code: 'ENOENT' });
        expect(f.usage).toEqual([]);
      } finally {
        clock.mockRestore();
        vi.unstubAllEnvs();
      }
    },
  );
}
