import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import { Schema } from 'effect';
import { OpenAiSchema } from '@effect/ai-openai';
import { Action2Schema, Observation2Schema, PhaseKind2Schema } from '../src/shared/succession';
import type { Action2, Capability } from '../src/shared/succession';

const PromptEvent = Schema.Struct({
  type: Schema.String,
  text: Schema.String,
  data: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
  seat: Schema.optional(Schema.Number),
});

/** The JSON user message emitted by housePrompt, without an invented observation wrapper. */
export const SuccessionProviderPrompt = Schema.Struct({
  task: Schema.Literals(['action', 'chat']),
  style: Schema.String,
  notes: Schema.String,
  you: Observation2Schema.fields.you,
  private: Observation2Schema.fields.private,
  phase: PhaseKind2Schema,
  round: Observation2Schema.fields.round,
  board: Observation2Schema.fields.board,
  act: Observation2Schema.fields.act,
  act1Result: Observation2Schema.fields.act1Result,
  seats: Observation2Schema.fields.seats,
  lastGovernment: Schema.Null,
  facts: Schema.Array(PromptEvent),
  chat: Schema.Array(Schema.Struct({ seat: Schema.optional(Schema.Number), text: Schema.String })),
  choices: Schema.Array(Schema.Struct({ index: Schema.Number, label: Schema.String, action: Action2Schema })),
});

export type SuccessionProviderPrompt = typeof SuccessionProviderPrompt.Type;

const ProviderBody = Schema.Struct({
  model: Schema.String,
  max_output_tokens: Schema.Number,
  store: Schema.Literal(false),
  stream: Schema.optional(Schema.Literal(false)),
  input: Schema.Array(
    Schema.Struct({
      role: Schema.Literals(['system', 'user']),
      content: Schema.Array(Schema.Struct({ type: Schema.Literal('input_text'), text: Schema.String })),
    }),
  ),
  text: Schema.Struct({
    format: Schema.Struct({
      type: Schema.Literal('json_schema'),
      name: Schema.Literal('house_decision'),
      description: Schema.String,
      schema: Schema.Record(Schema.String, Schema.Json),
      strict: Schema.Literal(true),
    }),
  }),
});

export interface CapturedProviderRequest {
  body: typeof ProviderBody.Type;
  route: string;
  method: string;
  system: string;
  prompt: SuccessionProviderPrompt;
  /** UTF-8 bytes of the user prompt, matching production's prompt ceiling. */
  promptBytes: number;
  selectedIndex: number;
  selectedAction: Action2 | null;
  message: string | null;
  notes: string;
  responseId: string;
  /** Null until a held response is released or its client disconnects. */
  status: number | null;
  aborted: boolean;
}

type Choice = SuccessionProviderPrompt['choices'][number];

/** Pure seat-entitled policy: captures from other requests are never consulted. */
function selectChoice(prompt: SuccessionProviderPrompt): Choice {
  const choices = prompt.choices;
  const first = choices[0];

  if (!first) throw new Error('An action prompt must contain legal choices');
  const find = (type: Action2['type']) => choices.find(({ action }) => action.type === type);
  const seat = prompt.you?.seat ?? 0;

  if (prompt.private?.act === 1) {
    const knowledge = prompt.private;

    const policy = choices.find(({ action }) => {
      if (action.type !== 'discard' && action.type !== 'enact') return false;
      const card = knowledge.hand.find((entry) => entry.id === action.cardId);

      // Preserve safeguards while discarding; enact them when available to shorten Act 1.
      return card?.policy === (action.type === 'discard' ? 'override' : 'safeguard');
    });

    const approve = choices.find(({ action }) => action.type === 'vote' && action.approve);
    const denyVeto = choices.find(({ action }) => action.type === 'veto' && !action.approve);

    const executeKnownOverlord = choices.find(
      ({ action }) => action.type === 'execute' && action.target === knowledge.knownOverlord,
    );

    return policy ?? approve ?? denyVeto ?? executeKnownOverlord ?? find('enact') ?? first;
  }

  if (prompt.private?.act !== 2 || prompt.board.act !== 2) return first;
  const hand = prompt.private.hand;
  const has = (capability: Capability) => hand.some((card) => card.capability === capability);
  const round = prompt.board.tableRound;
  const ownCoins = prompt.seats.find((entry) => entry.number === seat)?.coins ?? 0;

  const truthfulBlock = choices.find(({ action }) => action.type === 'block' && has(action.capability));

  if (find('block')) return truthfulBlock ?? find('pass') ?? first;

  // Two peaceful rounds give tax/income/steal time to fund a real coup before challenges thin the table.
  if (find('challenge')) return (round >= 3 ? find('challenge') : find('pass')) ?? first;

  const value = (capability: Capability) =>
    ({ treasurer: 5, assassin: 4, guard: 3, thief: 2, envoy: 1 })[capability];

  if (find('lose-influence'))
    return [...choices].sort((left, right) => {
      const rank = ({ action }: Choice) =>
        action.type === 'lose-influence'
          ? value(hand.find((card) => card.id === action.cardId)?.capability ?? 'envoy')
          : Infinity;

      return rank(left) - rank(right);
    })[0];

  if (find('return-influence')) {
    const pool = prompt.private.exchangePool;

    const rank = ({ action }: Choice) =>
      action.type === 'return-influence'
        ? action.cardIds.reduce(
            (sum, id) => sum + value(pool.find((card) => card.id === id)?.capability ?? 'envoy'),
            0,
          )
        : Infinity;

    return [...choices].sort((left, right) => rank(left) - rank(right))[0];
  }

  const attack = (type: 'steal' | 'assassinate' | 'coup') => {
    const candidates = choices.filter(({ action }) => action.type === type);

    const rank = ({ action }: Choice) => {
      if (!('target' in action)) return -Infinity;
      const target = prompt.seats.find((entry) => entry.number === action.target);
      const clockwise = (action.target - seat + 10) % 10;

      return type === 'steal'
        ? (target?.coins ?? 0) * 100 - clockwise
        : (2 - (target?.influence ?? 2)) * 100 - clockwise;
    };

    return candidates.sort((left, right) => rank(right) - rank(left))[0];
  };

  if (ownCoins >= 7 && find('coup')) return attack('coup')!;

  if (round === 1) {
    // Distinct early slots exercise exchange and its private return pool, income, stealing and tax.
    const opening = ['exchange', 'income', 'steal', 'tax'] as const;
    const type = opening[Math.min(prompt.board.slot, opening.length - 1)];

    return (type === 'steal' ? attack(type) : find(type)) ?? first;
  }

  if (round === 2) {
    // Keep most seats saving for coups; one late slot attacks while reactions still pass.
    if (prompt.board.slot === 9 && find('assassinate')) return attack('assassinate')!;

    return find('tax') ?? find('income') ?? first;
  }

  return attack('assassinate') ?? find('tax') ?? attack('steal') ?? find('income') ?? first;
}

export async function startSuccessionProvider(
  options: { failFirstAction?: boolean; mode?: 'play' | 'invalid' | 'timeout' } = {},
): Promise<{
  url: string;
  requests: CapturedProviderRequest[];
  errors: string[];
  close(): Promise<void>;
  release(): void;
}> {
  const requests: CapturedProviderRequest[] = [];
  const errors: string[] = [];
  const held = new Map<ServerResponse, () => void>();
  let failedAction = false;
  let released = false;
  let closing: Promise<void> | undefined;

  const server = createServer((request, response) => {
    const handle = async () => {
      if (request.method !== 'POST' || request.url !== '/v1/responses') {
        errors.push(`Unexpected provider route: ${request.method} ${request.url}`);
        response.writeHead(404).end();

        return;
      }

      const chunks: Buffer[] = [];

      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = Schema.decodeUnknownSync(ProviderBody)(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      const systemMessages = body.input.filter((message) => message.role === 'system');
      const userMessages = body.input.filter((message) => message.role === 'user');

      if (systemMessages.length !== 1 || userMessages.length !== 1)
        throw new Error('Expected exactly one system message and one user message');
      const text = userMessages[0].content.map((part) => part.text).join('');
      const prompt = Schema.decodeUnknownSync(SuccessionProviderPrompt)(JSON.parse(text));
      const choice = prompt.task === 'action' ? selectChoice(prompt) : null;
      const responseId = `resp_succession_fixture_${requests.length + 1}`;
      const seatMarker = `provider-chat-seat${prompt.you?.seat ?? 'none'}`;

      const alreadySpoke =
        prompt.notes.includes('public-chat-sent') || prompt.chat.some((entry) => entry.text === seatMarker);

      const message = prompt.task === 'chat' && !alreadySpoke ? seatMarker : null;

      const notes = [
        `provider-note-seat${prompt.you?.seat ?? 'none'}-generation${prompt.you?.generation ?? 0}`,
        `act${prompt.act}-${prompt.phase}-round${prompt.round}-${responseId}`,
        ...(alreadySpoke || message ? ['public-chat-sent'] : []),
      ].join(' ');

      const selectedIndex =
        options.mode === 'invalid' && prompt.task === 'action'
          ? Math.max(...prompt.choices.map((entry) => entry.index)) + 1
          : (choice?.index ?? -1);

      const capture: CapturedProviderRequest = {
        body,
        route: request.url,
        method: request.method,
        system: systemMessages[0].content.map((part) => part.text).join(''),
        prompt,
        promptBytes: Buffer.byteLength(text, 'utf8'),
        selectedIndex,
        selectedAction: selectedIndex === choice?.index ? choice.action : null,
        message,
        notes,
        responseId,
        status: null,
        aborted: false,
      };

      requests.push(capture);
      response.on('close', () => {
        held.delete(response);

        if (!response.writableFinished) capture.aborted = true;
      });

      if (options.failFirstAction && prompt.task === 'action' && !failedAction) {
        failedAction = true;
        capture.status = 503;
        response.writeHead(503, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({ error: { message: 'Fixture transient failure', type: 'server_error' } }),
        );

        return;
      }

      const result = {
        id: responseId,
        object: 'response',
        model: body.model,
        created_at: Math.floor(Date.now() / 1000),
        output: [
          {
            id: `msg_${responseId}`,
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({ choice: selectedIndex, message, notes }),
                annotations: [],
              },
            ],
          },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          total_tokens: 120,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 0 },
        },
      } satisfies OpenAiSchema.Response;

      const send = () => {
        if (response.destroyed) return;
        capture.status = 200;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(result));
      };

      if (options.mode === 'timeout' && prompt.task === 'action' && !released) held.set(response, send);
      else send();
    };

    void handle().catch((error: Error) => {
      errors.push(error.message);

      if (!response.destroyed) {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'Invalid fixture provider request' } }));
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());

  return {
    url: `http://127.0.0.1:${address.port}/v1`,
    requests,
    errors,
    release() {
      released = true;

      for (const send of held.values()) send();
      held.clear();
    },
    close() {
      closing ??= new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
        held.clear();
      });

      return closing;
    },
  };
}
