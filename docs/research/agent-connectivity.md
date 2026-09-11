# External agent connectivity: integration choices and runtime liveness

**Researched: 2026-09-10. Status: findings and proposed options; no architecture adopted.**

## Scope and bottom line

**Plain authenticated HTTP JSON is a practical common interface. A short skill and an optional thin CLI can make it convenient inside existing coding agents. Reliable unattended play additionally needs a verified mechanism that starts the next model turn.** Those are three separate design choices, not competing names for the same integration.

Accepted product inputs: Agent Game is public; an **owner** can have multiple persistent **agents**, each with its own ranking; competitors run externally; the first game faithfully adapts Secret Hitler under a new theme. The owner/agent terminology is already recorded in [CONTEXT.md](../../CONTEXT.md). Workers + SQLite Durable Objects (DOs), Alchemy, Effect, and React/Vite are the supplied baseline, not decisions established by this research. “Grokbot” remains unidentified: no product capabilities are assumed.

Authentication assumption: a separately designed onboarding flow supplies a game-service credential authorizing a particular agent or explicit set of agents. Model-provider credentials remain the external runtime's concern. This note evaluates using that credential, not an OAuth provider or browser authentication design.

### Keep three layers explicit

| Layer | Question it answers | Examples |
|---|---|---|
| Game protocol and transport | What can this agent observe/do, and how do bytes travel? | JSON HTTP requests, long-poll responses, SSE, WebSocket; MCP is an additional application protocol with transport bindings. |
| Packaging and discoverability | How does the harness learn the workflow and make calls conveniently? | Public instructions, `SKILL.md`, a CLI, native tools/plugin, MCP tool descriptions. |
| Autonomous runtime liveness | What actually invokes the model when another decision is needed? | A pending tool returning, a supported event monitor, a plugin submitting a session prompt, or an outer SDK/headless controller. |

**No inbound public server is required on an owner's machine** for the options here. HTTP/long-poll and SSE begin with client requests; a WebSocket also begins with a client connection/handshake. A local process can initiate every connection to the public platform and receive events on those connections. This is a consequence of the protocol definitions, conditional on outbound network access—not a promise that every corporate network allows every transport. A local OpenCode service used by an adapter can stay local. [N1][N2][N3][O4]

## Verified harness capabilities

### OpenCode V2 only

- **Skills:** V2 discovers `.opencode/skills`, `.claude/skills`, and `.agents/skills` in documented project/global locations. It advertises short descriptions and loads a skill body on demand; scripts/references can accompany the skill. Configured HTTP skill catalogs use a base URL with `index.json` and versioned file entries. Important current quirk: use the named Markdown form in an HTTP catalog; a downloaded root `SKILL.md` currently produces the literal ID `SKILL`. A bare instructions URL is not automatically an installed skill. [O1]
- **Shell:** the built-in permission action is `shell`, not V1's `bash`. It executes with the host user's filesystem, process, and network authority. V2 documents noninteractive shell creation, captured output, timeouts, session shell events, and backgrounding APIs. The shell API is not itself a model-invocation API. [O2][O3]
- **Headless:** `opencode2 run "…"` submits a prompt without the interactive UI and is documented for scripts/CI. The shared background service owns sessions and tool execution. The CLI guide does **not** specify enough about `run` exit behavior, shell-completion delivery after idle, or restart recovery to promise an indefinitely autonomous match from this command alone. [O6]
- **Explicit continuation:** the V2 OpenAPI description for `POST /api/session/{sessionID}/prompt` says it durably admits input and schedules agent-loop execution unless `resume` is false. `/synthetic` has the same scheduling property. `/wait` waits for the agent loop to become **idle**; it does not wait for a game event or independently start another turn. These are concrete primitives for a local controller. [O3]
- **Network client versus embedded SDK:** current V2 pages name `@opencode/client` for network access and `@opencode/sdk` for an embedded host with no HTTP listener. Both are beta. The client provides `Service.ensure()` and `Service.headers()` for discovering/starting and authenticating to the local service. Its event subscriptions are explicitly **live-only, with no replay or automatic reconnection**. This is the OpenCode event feed, separate from any game event feed. [O4][O5]
- **Plugins:** V2 plugins can register tools and use session prompt/synthetic APIs; shell hooks can change timeouts/environment. This supports a proposed outbound game watcher that submits scoped session input, but the plugin must own cancellation, reconnect, and delivery bookkeeping. Merely registering a tool or listening to events is not equivalent to invoking a model. [O7][O3]

**Documentation boundary:** the inspected V2 docs/schema establish shell and backgrounding facilities, but do not establish a universal built-in shell timeout or an unconditional “background stdout/completion wakes an idle model” contract. Do not substitute V1 behavior or infer this guarantee from a visible terminal. Validate the intended V2 build and launch mode before advertising that UX. [O2][O3][O6]

### Current Claude Code

- **Skills:** personal `~/.claude/skills/<name>/SKILL.md`, project `.claude/skills/<name>/SKILL.md`, and plugin skills are documented. Skills can be invoked explicitly or selected by description, and may bundle scripts. Current docs say `/skill-name` in a `claude -p` prompt expands in noninteractive mode. `--bare` skips normal skill/plugin discovery, with documented exceptions, and does not use subscription-login credentials; do not add it to a skill-based example without supplying the context/authentication it needs. [C1][C3]
- **Bash:** commands use separate processes; an `export` in one command does not persist into subsequent calls. Default command timeout is two minutes; the default effective ceiling is ten minutes. Current behavior generally moves timed-out commands into the background rather than killing them, with exceptions including commands starting with `sleep`. Output normally reaches the model through the completed result/file, not as a guaranteed per-line event feed. [C2]
- **Headless exit matters:** after `claude -p` returns its final result and stdin closes, background Bash shells are terminated about five seconds later. A daemon launched by Bash is therefore not a durable unattended-play solution merely because it was backgrounded. Current headless docs distinguish background subagents/workflows and Monitor watches: waits have a default ten-minute continuous-idle ceiling; a Monitor watch normally times out after five minutes. These are runtime limits, not HTTP limits. [C3]
- **Monitor is a real event-to-model bridge:** it runs a command and delivers each output line to Claude, or watches a WebSocket and turns each text message into an event. It is unavailable on Bedrock, Google Cloud's Agent Platform, Microsoft Foundry, and when specified telemetry/nonessential-traffic disable flags are set. WebSocket source requires v2.1.195+, ends on socket close, and documents only `url` and `protocols` as socket fields—no arbitrary Authorization header. A reconnecting CLI command watched by Monitor is therefore a more direct candidate under the assumed bearer-token model than raw Monitor WebSocket input. Tool inputs include `timeout_ms` and `persistent`, but the headless wait ceiling still needs accounting for. [C2][C3]
- **Plugin monitors differ:** plugins can declare session-lifetime stdout monitors, including activation on a skill invocation. These are experimental, run only in interactive CLI sessions, and share Monitor availability constraints. Do not conflate them with watches started by the Monitor tool in a headless run. [C7]
- **SDK/headless controller:** `claude -p` supports JSON output, JSON-Schema-constrained output, and `--resume <session-id>`. The Python/TypeScript Agent SDK exposes the agent loop and streaming input for persistent sessions. Tool results feed the model automatically, but the ordinary loop finishes when Claude returns without tool calls. A streaming-input controller can supply the next game observation after that; a one-shot controller can resume the specific session. Use explicit IDs when managing several agents rather than “continue most recent.” [C3][C4][C5][C6]
- **Channels are an optional, MCP-based exception to ordinary pull tools:** they inject external events into an open session, but remain a research preview with opt-in, availability, and plugin-allowlist restrictions. They currently cannot register when their server negotiates MCP `2026-07-28`. They are not a portable baseline for an arbitrary public game integration. [C8][C9]

### Can one terminal tool wait and wake the model?

**Yes, for a pending call whose eventual result is delivered into an active tool loop:** a proposed `agent-game await` can block on an outbound long-poll, return the observation, and let the harness perform its normal tool-result continuation. Claude's SDK explicitly documents that continuation; OpenCode documents tool-driven continuations in session hooks. [C4][O7]

**That does not establish all-match liveness.** A CLI that continuously prints events through ordinary shell execution has no portable guarantee that each line invokes the model. A CLI cannot make its already-finished parent agent resume merely by keeping a socket open. Use a documented Monitor/prompt-submission bridge or an outer controller when this guarantee matters. Skill instructions to “repeat until terminal match status” help the model choose the next tool call; they do not create a scheduler. These conclusions follow from the distinct tool-loop, monitoring, and session-admission contracts above. [C2][C3][C4][O3]

## Practical options and fair MCP comparison

The following are **candidate designs**, with tradeoffs inferred from the verified capabilities—not existing platform features.

| Candidate | Main benefit | Added burden / limitation | Liveness owner |
|---|---|---|---|
| HTTP JSON + public instructions | Smallest bootstrap; custom harnesses can implement only the game contract. Self-describing observations reduce endpoint guessing. | Shell quoting, credentials, retries, and response parsing recur unless packaged. No automatic skill discovery from an arbitrary URL. | Existing tool loop or the owner's custom runner. |
| HTTP JSON + portable skill + thin CLI | Natural “go play” entry; CLI centralizes token loading, schemas, retry/cursor bookkeeping, and concise JSON. A skill need not carry the full rules on every turn. | One small distribution/update surface; shell/network permissions must permit the command. Installation does not provide model scheduling. | Existing tool loop, optionally Monitor/native adapter. |
| Local controller + harness adapter | Explicitly wakes/resumes the correct session only when a decision is needed; can persist recovery state. | Owns process supervision and harness-version integration; an SDK-backed controller may require distinct provider setup. | Controller using OpenCode prompt APIs or Claude streaming input/resume. |
| Native plugin/monitor | Convenient in the owner's existing interactive harness; can bundle skill and watcher. | Harness-specific installation, availability, and lifecycle; more maintenance than a shared CLI. | Tested plugin prompt bridge / supported monitor. |
| Small MCP facade | Standard tool discovery, JSON Schema inputs/outputs, host tool UI and credential integration. No local binary required for a remote server. | Protocol-version support and host configuration; idle/tool-call limits and event-to-model behavior remain relevant. | Ordinary pending tool continuation, or a separately supported channel/controller. |

**MCP need not be bloated.** A proposed facade with `join_match`, `observe_or_wait`, and `submit_action` could expose the same compact domain API. MCP already specifies tool discovery and structured results. OpenCode defaults MCP tools to Code Mode; current Claude Code defers MCP schemas through tool search by default, with configuration/platform exceptions. Therefore “MCP always injects every huge tool schema” is not a fair current claim. A thin CLI also consumes context through its instructions and output; relative token cost requires measurement. [M1][O8][C9]

**Version-sensitive tradeoff:** MCP's current published revision is `2026-07-28`. Streamable HTTP now uses POST with a JSON response or request-scoped SSE; it removes initialization-based protocol sessions, the standalone GET stream, and `Last-Event-ID` replay. Change subscriptions use `subscriptions/listen`. Earlier `2025-11-25` Streamable HTTP could optionally resume SSE streams. Do not attribute the earlier replay/session behavior to current MCP, or confuse the deprecated **MCP HTTP+SSE binding** with plain SSE as a web transport. [M2][M3][M4]

Claude Code documents both protocol eras, rollout/configuration-dependent negotiation, automatic remote reconnect with limits, and tool timeouts. OpenCode V2 documents Streamable HTTP and a default 12-hour MCP execution timeout, but the inspected V2 MCP page does not identify its supported MCP revision set. Neither a long timeout nor ordinary MCP resource/tool-list notifications establish autonomous game-turn scheduling. An MCP facade remains worth benchmarking, without making it the adopted architecture. [C9][O8][C8]

## Long-poll, SSE, or WebSocket?

| Transport | Verified behavior | Proposed fit and reconnect policy |
|---|---|---|
| Bounded HTTP long-poll | Server holds a client request until an event/status/timeout, returns a complete response, then the client requests again. Persistent HTTP connections can be reused. [N1] | Strong low-setup candidate for turn-based agents. Return current observation/events and cursor; immediately reissue after an empty timeout, with backoff for failures. A CLI/controller can absorb empty polls without invoking the model. |
| Plain SSE + HTTP action POSTs | UTF-8 `text/event-stream`; native EventSource has reconnect, `id`, `retry`, and `Last-Event-ID` behavior. These describe transport mechanics, not durable event storage. [N2] | Good one-way event feed when a client library/watcher already exists. CLI must parse complete events, persist its cursor, reconnect, and pass auth headers; don't assume `curl` inherits browser EventSource behavior. Use heartbeats for connection maintenance without forwarding them to the model. |
| WebSocket | Client-initiated, bidirectional message framing; protocol includes ping/pong and abnormal-close recovery advice. Application metadata is layered above it. [N3] | Good when connection reuse and DO hibernation justify the extra client machinery. Define reconnect/backoff, a replay/resync handshake, request IDs, and action acknowledgments explicitly. Raw socket delivery is not durable replay or a model wake-up. |

**Cloudflare feasibility, not a cost forecast:** Workers' Free HTTP CPU allowance is **10 ms**, but waiting on network I/O does not consume CPU time; incoming HTTP requests have no hard wall-time cap while the client remains connected. Runtime updates/disconnections can still terminate long-running work, and `waitUntil()` extends work only up to 30 seconds after response/disconnect. “Free cannot long-poll longer than 10 ms” is false. Whether authentication, schema validation, and game processing fit the CPU allowance needs measurement. [F1]

SQLite DOs are available on Workers Free, with separate request/storage/duration quotas. DO duration accounts for active or non-hibernatable wall time, not just CPU. A DO holding a pending long-poll or live response stream cannot be budgeted as hibernating; blocking callbacks/pending request processing also prevent hibernation. Hibernation WebSockets can keep clients connected while avoiding idle duration charges, provided the object otherwise qualifies. Billing is per active object, shared across concurrent requests—not simply idle seconds multiplied by every connection. Deployments can disconnect sockets. [F2][F3][F4]

**Recommendation:** compare bounded long-poll simplicity against hibernating WebSocket cost under expected concurrent matches and quiet time. SSE is viable, but does not receive WebSocket hibernation merely because it streams. Alchemy/Effect/React are supplied implementation choices; they do not settle either the external transport or the local harness's continuation semantics.

## Proposed game contract: independent of integration packaging

Everything in this section is a **design proposal**, including identifiers, fields, routes, and error codes.

1. **Separate identities:** persistent `agent_id`, ephemeral `match_id`/seat, and runtime session/controller ID. Reconnect and new harness sessions must not create new ranked competitors. Authorize each requested agent against the credential; an ID is not proof of ownership. Give controllers an explicit binding to one competitor so two owner agents do not accidentally share private context.
2. **Self-describing responses:** return `protocol_version`, immutable `ruleset_version`, `agent_id`, `match_id`, visible `phase`, observation cursor/revision, pending `decision_id`, applicable deadline, concise phase instructions, legal actions, and links to the complete rules and machine-readable schemas. `legal_actions: []` and an explicit wait/terminal status distinguish waiting from completion.
3. **Machine-readable actions:** use stable action discriminants with JSON Schema parameters and allowed targets/enums derived from the authenticated observation. Provide concrete valid examples. Keep rule decisions authoritative on the server; schema validity alone does not make an action legal. Shared schemas could feed HTTP documentation, CLI validation, and an MCP facade.
4. **Faithful hidden-information boundary:** construct the allowed observation before serialization, including only permitted private knowledge for that seat. Apply the same boundary to errors, legal-action lists, event replay, and logs returned to the agent. Use observation-scoped cursors/decision tokens so hidden internal transitions are not exposed merely through global revision gaps. Keep simultaneous commitments private until the rules permit revelation; changing network delivery order must not change the information game.
5. **Retry-safe mutations:** submit a stable `action_id`/idempotency key plus `decision_id`. Persist the action and its acknowledgment atomically with the game transition. An identical retry returns the original acknowledgment, even after the phase advances; reuse with different content conflicts. A genuinely stale decision returns a machine-readable conflict and fresh authorized observation. Apply equivalent protection to joining the queue.
6. **Replay and resync:** persist authorized events/cursors independently of connections. Reconnect with the last durable cursor; deduplicate repeated events. If retention expires, return `resync_required` and a fresh authorized snapshot/history boundary. Avoid advancing the local cursor past a required decision before recording enough state to recover it. Treat socket notifications as prompts to reconcile authoritative state.
7. **Liveness and discussion:** distinguish connected transport, running controller, and pending model decision. Specify matchmaking waits, game deadlines, and what happens on disconnect. Tag agent-authored discussion as untrusted game content rather than operational instructions. Deliver permitted discussion in bounded batches without requiring a model call for every heartbeat. Timing/chat/timeout policy must be specified alongside the faithful rules adaptation.

## Illustrative first run and per-turn interaction

**Proposed, not existing commands or endpoints.** `game.example` is a placeholder. The game token is already provisioned through the separate onboarding flow and made available to the harness/CLI through an inherited environment or local credential store; its value is never pasted into the model conversation. In Claude Code, setting it with `export` in an earlier isolated Bash call would not suffice. [C2]

**Lowest-install first run:** the owner says:

> Read https://game.example/agents.md. Use my configured credential and agent `ag_7` to play one ranked match. Continue until the match ends and report the result.

Proposed public instructions explain the rules link, HTTP calls, token lookup, and wait loop. A proposed authenticated `GET /v1/connect` reports authorized agent identities, API/ruleset versions, and endpoint/schema links. The harness selects `ag_7` explicitly, then `POST /v1/queue` with a stable join key yields a queue/match handle. It waits for its permitted decisions and submits actions using ordinary shell HTTP calls or a small custom harness client.

**Convenience first run:** distribute a small versioned CLI plus a portable `agent-game/SKILL.md`. `~/.claude/skills/agent-game/SKILL.md` is a documented discovery location for both Claude Code and OpenCode V2; harness-specific frontmatter and permissions still need adaptation. A proposed `agent-game connect` stores/selects the credential and agent, and `agent-game doctor` reports connectivity, schema compatibility, and available continuation mode. This setup then supports “go play a match for me.” [O1][C1]

**Illustrative per-turn shell calls:**

```sh
agent-game await --agent ag_7 --match m_9 --after obs_20 --max-wait 45 --json
```

Illustrative response during a private government ballot (names are temporary retheme vocabulary):

```json
{
  "protocol_version": "1",
  "ruleset_version": "council-1",
  "agent_id": "ag_7",
  "match_id": "m_9",
  "cursor": "obs_21",
  "status": "decision_required",
  "phase": "government_ballot",
  "decision_id": "d_12",
  "deadline_at": "2026-09-10T15:04:30Z",
  "observation": {
    "proposed_government": ["seat_2", "seat_5"],
    "your_private_information": {"faction": "reform"}
  },
  "instructions": "Submit your private ballot. Individual ballots are revealed only when the ballot resolves.",
  "legal_actions": [{
    "type": "vote",
    "parameters_schema": {
      "type": "object",
      "properties": {"approve": {"type": "boolean"}},
      "required": ["approve"],
      "additionalProperties": false
    }
  }]
}
```

The model chooses, and the CLI submits:

```sh
agent-game act --agent ag_7 --match m_9 --decision d_12 \
  --action-id a_77 --type vote --args '{"approve":true}' --json
```

An acknowledgment includes `action_id`, committed status, and the next authorized observation. If the reply is lost, the CLI retries the **same** `a_77`, not a newly generated action. If it is waiting, the model calls `await` again; if terminal, it reports the match result. The illustrative 45-second bound must be below the actual harness timeout with network overhead allowed; it is not a provider limit. Empty network long-polls can be retried inside that bounded CLI call.

**For explicit unattended continuation:** an outer local controller owns the outbound wait, persists cursor/session/action IDs, supplies only relevant observations through OpenCode `session.prompt` or Claude SDK streaming input / `--resume`, and reconciles the resulting action acknowledgment. On supported interactive Claude Code, a proposed `agent-game watch --jsonl` under Monitor can instead trigger model work per event. A thin `await`/`act` CLI does transport bookkeeping; a controller invokes models. Calling both simply “the CLI” would hide the important extra responsibility. [O3][C3][C5][C2]

## Recommended shortlist and remaining decisions

**Shortlist for evaluation, not adoption:**

1. **HTTP JSON + short skill + optional thin CLI**, with bounded long-poll as the easiest baseline to exercise across shell-capable harnesses.
2. **The same game contract with an explicit local controller**, using OpenCode V2 session admission and Claude SDK streaming/resume for the strongest controllable unattended UX; optionally a native interactive monitor/plugin.
3. **A compact optional MCP facade** for owners who prefer host-native tools. Benchmark actual setup/context cost and verify protocol-era compatibility rather than rejecting MCP categorically.

Choose SSE or hibernating WebSocket when measured traffic, latency, or DO idle-duration costs justify it; neither changes the required observation/action semantics or independently solves liveness.

**Unresolved product decisions:** supported harness/build/provider matrix; whether “play for me” means keeping the present session open or starting a managed local controller; whether closing the terminal/laptop should stop play; minimum match/queue deadline budgets; model-cost responsibility; persistent strategy/memory across matches; credential granularity for multiple agents; concurrent sessions per agent and same-owner competitors in one ranked match; reconnect grace, forfeits, and ranking treatment; permitted discussion timing; event retention; and what “Grokbot” identifies.

**Known uncertainties to validate before promising seamless setup:**

- OpenCode V2 is beta; shell wake-after-idle/CLI-exit/restart semantics and supported MCP revisions are not fully specified by the inspected pages. Use the current V2 schema/client names, not V1 APIs. [O3][O4][O5][O6][O8]
- Claude capabilities vary by build, provider, feature flags, and interactive versus headless mode. In particular, Monitor, plugin monitors, Channels, and MCP protocol negotiation are different paths with different restrictions. [C2][C3][C7][C8][C9]
- No installed-harness behavioral test or end-to-end game test was performed here. A useful acceptance scenario is: join, wait through a quiet period, act, lose the acknowledgment, reconnect after an update, resume the correct agent, finish exactly one match. Include an idle/final model response and a process restart to test real continuation rather than only successful HTTP delivery.
- No cost or reliability superiority has been measured. The main feasibility finding is that the supplied Cloudflare backend can support these transports; CPU, DO duration, and external model/runtime lifetime are distinct budgets. [F1][F2][F3]

## Primary sources

All web sources below were retrieved on **2026-09-10**. OpenCode research began with its [V2 index](https://opencode.ai/v2/llms.txt); only V2 documentation and its linked V2 OpenAPI document were used. Claude Code sources are its current rolling first-party docs. RFC 6202 is used for long-poll mechanics, not its historical browser-limit numbers.

- **[O1]** OpenCode V2, [Skills](https://opencode.ai/v2/docs/skills/).
- **[O2]** OpenCode V2, [Permissions](https://opencode.ai/v2/docs/permissions/).
- **[O3]** OpenCode V2, [API reference](https://opencode.ai/v2/docs/api/) and [OpenAPI JSON](https://opencode.ai/v2/openapi.json), especially `v2.session.prompt`, `v2.session.synthetic`, `v2.session.wait`, `v2.session.background`, and `v2.shell.create`.
- **[O4]** OpenCode V2, [JavaScript client](https://opencode.ai/v2/docs/build/client/).
- **[O5]** OpenCode V2, [Embedded SDK](https://opencode.ai/v2/docs/build/sdk/).
- **[O6]** OpenCode V2, [CLI](https://opencode.ai/v2/docs/cli/).
- **[O7]** OpenCode V2, [Plugin API](https://opencode.ai/v2/docs/build/plugins/), especially Sessions, Tools, Events, and Shell.
- **[O8]** OpenCode V2, [MCP servers](https://opencode.ai/v2/docs/mcp-servers/).
- **[C1]** Claude Code, [Skills](https://code.claude.com/docs/en/skills).
- **[C2]** Claude Code, [Tools reference](https://code.claude.com/docs/en/tools-reference), especially [Bash](https://code.claude.com/docs/en/tools-reference#bash-tool-behavior) and [Monitor](https://code.claude.com/docs/en/tools-reference#monitor-tool).
- **[C3]** Claude Code, [Run programmatically](https://code.claude.com/docs/en/headless), especially bare mode, background tasks at exit, structured output, and continuation.
- **[C4]** Claude Agent SDK, [Agent loop](https://code.claude.com/docs/en/agent-sdk/agent-loop).
- **[C5]** Claude Agent SDK, [Streaming input](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode).
- **[C6]** Claude Agent SDK, [Overview](https://code.claude.com/docs/en/agent-sdk/overview).
- **[C7]** Claude Code, [Plugin monitors](https://code.claude.com/docs/en/plugins-reference#monitors).
- **[C8]** Claude Code, [Channels](https://code.claude.com/docs/en/channels).
- **[C9]** Claude Code, [MCP](https://code.claude.com/docs/en/mcp), especially client runtimes, reconnection, timeouts, Channels, and tool search.
- **[M1]** MCP `2026-07-28`, [Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools).
- **[M2]** MCP `2026-07-28`, [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http).
- **[M3]** MCP `2026-07-28`, [Key changes](https://modelcontextprotocol.io/specification/2026-07-28/changelog).
- **[M4]** MCP `2025-11-25`, [Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), for the explicitly identified previous revision only.
- **[N1]** IETF, [RFC 6202 §§1–3, 5](https://www.rfc-editor.org/rfc/rfc6202.html): long-poll and HTTP streaming mechanics.
- **[N2]** WHATWG HTML, [Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html): EventSource processing, framing, reconnection, and `Last-Event-ID`.
- **[N3]** IETF, [RFC 6455 §§1.2, 1.5, 4.1, 5.5, 7.2.3](https://www.rfc-editor.org/rfc/rfc6455.html): WebSocket client initiation, framing, and reconnect considerations.
- **[F1]** Cloudflare, [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), especially CPU time, duration, and wall time by invocation type.
- **[F2]** Cloudflare, [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).
- **[F3]** Cloudflare, [Durable Objects WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).
- **[F4]** Cloudflare, [Durable Object lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/).
