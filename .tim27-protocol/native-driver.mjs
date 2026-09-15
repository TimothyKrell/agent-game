import { pathToFileURL } from 'node:url';

const [root, configPath, harness] = process.argv.slice(2);

const { supervise } = await import(pathToFileURL(`${root}/cli/supervisor.mjs`));

const result = await supervise({
  harness,
  configPath,
  maxRuntimeMs: 10000,
  queueAllowanceMs: 2000,
  childSliceMs: 5000,
  // Isolate header handling from the independently diagnosed old fractional execFile timeout bug.
  clock: { now: Date.now, monotonic: Date.now, sleep: (ms) => new Promise((done) => setTimeout(done, ms)) },
});

console.log(JSON.stringify(result));
