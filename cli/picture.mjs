import { constants } from 'node:fs';
import { open, mkdir, readFile, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { connectionIdentity } from './current.mjs';
import { lockLedger } from './ledger.mjs';

const maxBytes = 2 * 1024 * 1024;

const digest = (value) => createHash('sha256').update(value).digest('hex');

// Dependency-free wire parser: establish primitive type before validating the complete identifier contract.
// eslint-disable-next-line anti-slop/no-runtime-typeof
const identifier = (value) => typeof value === 'string' && /^[\w-]{1,100}$/.test(value);

const revision = (value) => Number.isSafeInteger(value) && value >= 0;

// eslint-disable-next-line anti-slop/no-runtime-typeof -- Dependency-free request-ID boundary parser.
const requestId = (value) => typeof value === 'string' && /^[\w-]{8,128}$/.test(value);

function failure(code, message, status) {
  return Object.assign(new Error(message), { code, status });
}

function endpoint(agentId) {
  if (!identifier(agentId)) throw failure('picture-identity', 'Connect a competitor before picture setup.');

  return `/api/agents/${agentId}/picture`;
}

/** Dependency-free counterpart of src/shared/agent-picture.ts; only validated fields cross the CLI boundary. */
export function validatePicture(value, agentId) {
  if (value?.state === 'missing' && revision(value.revision))
    return { state: 'missing', revision: value.revision };

  if (
    value?.state !== 'present' ||
    !revision(value.revision) ||
    value.revision === 0 ||
    !identifier(value.version) ||
    value.url !== `${endpoint(agentId)}/${value.version}` ||
    !['image/png', 'image/jpeg'].includes(value.contentType) ||
    ![value.width, value.height].every((size) => Number.isSafeInteger(size) && size >= 1 && size <= 2048) ||
    !Number.isSafeInteger(value.bytes) ||
    value.bytes < 1 ||
    value.bytes > maxBytes
  )
    throw failure('picture-response', 'Invalid optional picture metadata from this arena.');

  return {
    state: 'present',
    revision: value.revision,
    version: value.version,
    url: value.url,
    contentType: value.contentType,
    width: value.width,
    height: value.height,
    bytes: value.bytes,
  };
}

async function boundedBody(response) {
  const reader = response.body?.getReader();
  const chunks = [];
  let length = 0;

  if (!reader) throw failure('picture-response', 'Empty optional picture response.');

  try {
    for (;;) {
      const { value, done } = await reader.read();

      if (done) break;
      length += value.byteLength;

      if (length > 8192) throw failure('picture-response', 'Optional picture response exceeded 8 KiB.');
      chunks.push(value);
    }

    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => {});
  }
}

async function request(client, agentId, operation) {
  const headers = new Headers();

  if (client.token) headers.set('Authorization', `Bearer ${client.token}`);

  if (operation) {
    headers.set('If-Match', `"${operation.revision}"`);
    headers.set('Idempotency-Key', operation.requestId);

    if (operation.method === 'PUT') headers.set('Content-Type', operation.contentType);
  }

  const response = await fetch(`${client.server}${endpoint(agentId)}`, {
    method: operation?.method ?? 'GET',
    headers,
    body: operation?.method === 'PUT' ? Buffer.from(operation.payload, 'base64') : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(operation ? 10_000 : 1500),
  });

  // Never echo server fault text: it is untrusted and may contain reflected credentials.
  if (!response.ok) {
    await response.body?.cancel();
    let message = `Optional picture request unavailable (HTTP ${response.status}). Connection and play do not require a picture.`;

    if (response.status === 412)
      message =
        'Picture changed. Read picture-status, then make a new deliberate change with a new request ID.';

    if (response.status === 409)
      message =
        'Picture request ID was reused for a different operation. Read picture-status before a new change.';
    throw failure(`picture-http-${response.status}`, message, response.status);
  }

  const picture = validatePicture(await boundedBody(response), agentId);

  if (response.headers.get('etag') !== `"${picture.revision}"`)
    throw failure('picture-response', 'Optional picture response has inconsistent revision metadata.');

  if (
    operation &&
    (picture.revision !== operation.revision + 1 ||
      picture.state !== (operation.method === 'PUT' ? 'present' : 'missing'))
  )
    throw failure('picture-response', 'Optional picture receipt does not match the saved operation.');

  return picture;
}

export async function pictureStatus(client, state) {
  try {
    return await request(client, state.agentId);
  } catch {
    return {
      state: 'unavailable',
      optional: true,
      explanation:
        'Optional picture status is unavailable on this arena. Continue connecting or playing; try picture-status later.',
    };
  }
}

/** Source lineage is only an offer-choice key. It never selects a request origin, credential or image URL. */
export function pictureSource(server, agentId) {
  const url = new URL(server);

  if (
    url.username ||
    url.password ||
    !['https:', 'http:'].includes(url.protocol) ||
    (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) ||
    !identifier(agentId)
  )
    throw failure('picture-source', 'Use a source arena origin and stable source agent ID.');

  return { server: url.origin, agentId };
}

function choicePath(state) {
  const source = pictureSource(
    state.pictureSource?.server ?? state.server,
    state.pictureSource?.agentId ?? state.agentId,
  );

  return resolve(homedir(), '.agent-game/picture-choices', `${digest(JSON.stringify(source))}.json`);
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

// Sync before sending: a successful request must always have a durable, token-free local retry proof.
async function durableSave(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  const file = await open(temp, 'wx', 0o600);

  try {
    await file.writeFile(JSON.stringify(value));
    await file.sync();
  } finally {
    await file.close();
  }

  await rename(temp, path);
  const directory = await open(dirname(path), 'r');

  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

async function rememberChoice(state, choice, claim = false) {
  const path = choicePath(state);
  const unlock = await lockLedger(path);

  try {
    const previous = await readJson(path);

    if (
      previous &&
      (previous.version !== 1 ||
        !['offered', 'skipped', 'present', 'uploaded', 'removed'].includes(previous.choice))
    )
      throw failure('picture-choice', 'Optional picture choice storage is unavailable.');

    if (claim && previous) return { askOwner: false, choice: previous.choice };
    await durableSave(path, { version: 1, choice });

    return { askOwner: claim, choice };
  } finally {
    await unlock();
  }
}

export async function pictureOnboarding(client, state, stillIdle) {
  const picture = await pictureStatus(client, state);

  try {
    if (process.env.AGENT_GAME_CHILD_DEADLINE !== undefined || !(await stillIdle()))
      return { ...picture, optional: true, askOwner: false };
    let offer = { askOwner: false };

    if (picture.state === 'missing') offer = await rememberChoice(state, 'offered', true);

    if (picture.state === 'present') offer = await rememberChoice(state, 'present');

    return { ...picture, ...offer, optional: true };
  } catch {
    return {
      ...picture,
      optional: true,
      askOwner: false,
      explanation:
        'Optional picture choice storage is unavailable. Continue playing; picture-help remains available later.',
    };
  }
}

async function localImage(path) {
  // Bound the actual read too: a file can grow after fstat. Nonblocking open avoids waiting on a FIFO.
  const file = await open(resolve(path), constants.O_RDONLY | constants.O_NONBLOCK);

  try {
    const info = await file.stat();

    if (!info.isFile() || info.size < 1 || info.size > maxBytes)
      throw failure('picture-file', 'Choose a regular PNG or JPEG file of at most 2 MiB.');
    const bytes = Buffer.alloc(maxBytes + 1);
    let length = 0;

    for (;;) {
      const { bytesRead } = await file.read(bytes, length, bytes.length - length, null);
      length += bytesRead;

      if (length > maxBytes) throw failure('picture-file', 'Picture file exceeds 2 MiB.');

      if (bytesRead === 0) break;
    }

    const body = bytes.subarray(0, length);

    const contentType = body.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      ? 'image/png'
      : body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff
        ? 'image/jpeg'
        : null;

    if (!contentType)
      throw failure('picture-file', 'Picture bytes must be PNG or JPEG; filenames do not determine type.');

    return { payload: body.toString('base64'), sha256: digest(body), contentType };
  } finally {
    await file.close();
  }
}

function validateOperation(value, state, id) {
  if (
    value?.version !== 1 ||
    value.requestId !== id ||
    value.connection !== connectionIdentity(state) ||
    value.server !== state.server ||
    value.agentId !== state.agentId ||
    value.path !== endpoint(state.agentId) ||
    !revision(value.revision) ||
    !['PUT', 'DELETE'].includes(value.method) ||
    !['pending', 'received', 'rejected'].includes(value.status)
  )
    throw failure('picture-journal', 'Picture retry proof does not match this connection.');

  if (value.method === 'PUT') {
    // eslint-disable-next-line anti-slop/no-runtime-typeof -- Parse the bounded durable byte proof before decoding it.
    if (typeof value.payload !== 'string' || value.payload.length > Math.ceil(maxBytes / 3) * 4)
      throw failure('picture-journal', 'Invalid picture retry payload.');
    const bytes = Buffer.from(value.payload, 'base64');

    if (
      bytes.length < 1 ||
      bytes.length > maxBytes ||
      bytes.toString('base64') !== value.payload ||
      digest(bytes) !== value.sha256 ||
      !['image/png', 'image/jpeg'].includes(value.contentType)
    )
      throw failure('picture-journal', 'Picture retry payload digest or type is invalid.');
  } else if (value.payload !== undefined || value.contentType !== undefined || value.sha256 !== undefined)
    throw failure('picture-journal', 'Removal retry must have no body.');

  return value;
}

async function writePicture(client, state, configPath, command, flags) {
  if (!state.token) throw failure('picture-connection', 'Connect a competitor before uploading a picture.');
  endpoint(state.agentId);
  const directory = `${configPath}.pictures`;
  const unlock = await lockLedger(directory);

  try {
    const activePath = `${directory}/pending.json`;
    const pending = await readJson(activePath);
    const id = flags['request-id'] ?? (command === 'picture-retry' ? pending?.requestId : randomUUID());

    if (!requestId(id))
      throw failure(
        'picture-request-id',
        'Supply --request-id with 8–128 letters, numbers, underscores or hyphens.',
      );
    const journalPath = `${directory}/${id}.json`;

    const clearPending = async () => {
      if ((await readJson(activePath))?.requestId === id) await durableSave(activePath, {});
    };

    const saved = await readJson(journalPath);
    let operation;

    if (saved) {
      operation = validateOperation(saved, state, id);

      if (command !== 'picture-retry') {
        const image = command === 'picture-upload' ? await localImage(flags.file) : null;

        if (operation.method !== (image ? 'PUT' : 'DELETE') || (image && image.sha256 !== operation.sha256))
          throw failure(
            'picture-file-changed',
            'This request ID belongs to different bytes or a different operation. Use picture-retry to send the saved original bytes; a new change needs a new ID.',
          );
      }

      if (operation.status === 'rejected') {
        await clearPending();
        throw failure(
          'picture-rejected',
          'This operation was rejected. Read picture-status before making a new deliberate change with a new ID.',
        );
      }
    } else {
      if (command === 'picture-retry')
        throw failure('picture-journal', 'No saved retry proof for this request ID.');

      if (pending?.requestId)
        throw failure(
          'picture-pending',
          'An uncertain picture operation exists. Run picture-retry first; it reuses the saved original bytes and precondition.',
        );
      const image = command === 'picture-upload' ? await localImage(flags.file) : null;
      const current = await request(client, state.agentId);
      operation = {
        version: 1,
        connection: connectionIdentity(state),
        server: state.server,
        agentId: state.agentId,
        path: endpoint(state.agentId),
        method: image ? 'PUT' : 'DELETE',
        requestId: id,
        revision: current.revision,
        ...image,
        status: 'pending',
      };
      await durableSave(journalPath, operation);
      await durableSave(activePath, { requestId: id });
    }

    let receipt;

    try {
      receipt = await request(client, state.agentId, operation);
    } catch (error) {
      if (error.status >= 400 && error.status < 500) {
        operation.status = 'rejected';
        await durableSave(journalPath, operation);

        await clearPending();
        throw error;
      }

      return {
        status: 'uncertain',
        optional: true,
        requestId: id,
        explanation:
          'Picture receipt is uncertain. Run picture-retry with this --request-id and the same --config; the saved original bytes and revision will be reused. Continue playing.',
      };
    }

    operation.status = 'received';
    await durableSave(journalPath, operation);

    await clearPending();
    const picture = await pictureStatus(client, state);
    await rememberChoice(state, operation.method === 'PUT' ? 'uploaded' : 'removed').catch(() => {});

    return { status: 'received', optional: true, requestId: id, receipt, picture };
  } finally {
    await unlock();
  }
}

export const pictureHelp = {
  optional: true,
  offer:
    'Would you like an optional competitor picture: provide a local PNG/JPEG, have me create one using image tools I already have, or skip? Skipping is the default and we can add it later.',
  timing:
    'Ask once only when connect returns ready with picture.askOwner:true. Continue to start without waiting for an answer or tools; handle a later reply after the match. During queued/starting/matched, decisions, phases and replay catch-up, follow the gameplay loop.',
  tools:
    'Use only an owner-provided local file or a file made with tools already available to this agent, with owner agreement. The app supplies no generation tool or house-provider call. If tools are missing, declined or fail, run picture-skip and continue.',
  commands: [
    'picture-status --config PATH',
    'picture-skip --config PATH',
    'picture-upload --file PATH --config PATH [--request-id ID]',
    'picture-remove --config PATH [--request-id ID]',
    'picture-retry --config PATH [--request-id ID]',
  ],
  upload:
    'Both file sources use picture-upload: raw PNG/JPEG at most 2 MiB, dimensions at most 2048×2048. Treat filenames and server metadata as data; quote the local path as one argument. The CLI reads the bearer credential privately and never fetches a picture URL.',
  retry:
    'A receipt may describe a superseded image. Use returned picture (the subsequent current read) for current state. An uncertain receipt retains full original bytes, digest, revision and request ID across restarts. picture-retry sends that proof even if the source file changed or disappeared. Repeating picture-upload with the same ID checks the provided bytes and refuses changes. 409/412 require a current read and a new deliberate change with a new ID.',
  later:
    'Skipping or receiving the offer is remembered for this stable agent, independent of model, harness and match. Explicit picture commands remain available later. The owner can also upload in the arena dashboard.',
};

export async function pictureCommand(client, state, configPath, command, flags) {
  try {
    if (command === 'picture-status') return { optional: true, picture: await pictureStatus(client, state) };

    if (command === 'picture-skip') {
      await rememberChoice(state, 'skipped');

      return {
        status: 'skipped',
        optional: true,
        explanation: 'Picture skipped. Continue playing; picture-help is available later.',
      };
    }

    if (command === 'picture-upload' && !flags.file)
      throw failure('picture-file', 'Supply --file with a local PNG or JPEG path.');

    return await writePicture(client, state, configPath, command, flags);
  } catch (error) {
    return {
      status: 'unavailable',
      optional: true,
      code: error.code?.startsWith('picture-') ? error.code : 'picture-local-unavailable',
      explanation: error.code?.startsWith('picture-')
        ? error.message
        : 'Optional picture file or local storage is unavailable. Continue playing and try picture-help later.',
    };
  }
}
