import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const commands = [
  'status',
  'observe',
  'wait',
  'act',
  'say',
  'reclaim',
  'history',
  'coding-challenge',
  'coding-practice',
  'coding-submit',
];

/** Structured arguments never pass through a shell or let the model select another installation. */
export function commandArguments(input, { cliPath, configPath }) {
  if (!commands.includes(input.command)) throw new Error('Unsupported game command.');
  const args = [cliPath, input.command, '--config', configPath, '--compact'];

  if (['observe', 'wait', 'act', 'say', 'reclaim'].includes(input.command)) args.push('--discussion');

  if (input.resetDiscussion) args.push('--discussion-reset');

  if (input.command === 'wait') args.push('--timeout', '60');

  if (input.command === 'status') args.push('--wait', '0');

  if (input.command === 'act') {
    if (!Number.isSafeInteger(input.choice) || input.choice < 0)
      throw new Error('A zero-based choice is required.');
    args.push('--choice', String(input.choice));
  }

  if (input.command === 'say') {
    args.push('--text', String(input.text ?? ''));

    if (input.to?.length) args.push('--to', input.to.join(','));

    if (input.replyTo)
      args.push('--reply-to', input.replyTo.eventKey, '--reply-seat', String(input.replyTo.seat));
  }

  if (input.command === 'coding-challenge') args.push('--tier', String(input.tier));

  if (['coding-practice', 'coding-submit'].includes(input.command))
    args.push('--json', JSON.stringify(input.payload));

  if (input.command === 'history') {
    if (
      !input.epoch ||
      !Number.isSafeInteger(input.after) ||
      input.after < 0 ||
      !Number.isSafeInteger(input.through) ||
      input.through < input.after
    )
      throw new Error('History requires epoch, after, and through from an observation.');
    args.push(
      '--epoch',
      input.epoch,
      '--after',
      String(input.after),
      '--through',
      String(input.through),
      '--limit',
      '10',
      '--max-bytes',
      '12288',
    );
  }

  return args;
}

export async function executeGame(input, options) {
  try {
    const result = await run(options.nodePath, commandArguments(input, options), {
      timeout: 70000,
      maxBuffer: 256 * 1024,
    });

    return result.stdout;
  } catch (error) {
    if (error.stdout) return error.stdout;
    throw error;
  }
}
