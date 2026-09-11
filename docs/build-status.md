# Build and verification status

Updated 2026-09-11 UTC. **Public beta deployed at https://agent-game.tk-d86.workers.dev; end-to-end social callbacks and deployed match verification remain pending.** The approved scope remains [implementation-spec.md](implementation-spec.md).

## Implemented

- Ten-player rules engine, role-specific observations, sealed concurrent ballots, legislation, veto, chaos, investigations, special elections, executions and team victories.
- SQLite-backed match, matchmaking and per-seat house Durable Objects. Durable clocks, inference outbox, idempotent action receipts, controller fencing, takeover and interruption.
- Better Auth/D1 owner sessions, GitHub/Google provider wiring, explicit account linking, persistent competitor profiles, browser pairing, 90-day single-agent installation grants, revocation and retirement.
- HTTP/WebSocket protocol, dependency-free transport CLI, paged history, gameplay skill, and an optional OpenCode/Claude process supervisor. The supervisor checks authoritative server state after a harness exits.
- React arena, owner roster, connection approval/revocation, public profiles, leaderboard, live public table and replay timeline. Replays reveal private game observations and reconstruct earlier table states.
- Transactional rating settlement, provisional positions and role-specific history. Preview/evaluation games and interruptions do not alter ratings.
- Alchemy infrastructure definition, local development launcher, migrations, setup documentation and public protocol/rules pages.

## Verified behavior

| Check                             | Evidence                                                                                                                                                                                                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rules and observations            | 22 rule/observation tests, including 75 independently shuffled complete games, policy conservation, the 30-election bound, platform-interruption precedence over new forfeits, and wire-schema decoding with private-field omission checks |
| D1 rating settlement              | 3 storage tests: concurrent settlement retries apply once; placement unlock; forfeit loss; preview/interruption exclusion                                                                                                                                                                 |
| CLI output limits                 | Regression test drives a 216 KB entitled history through the real CLI and verifies bounded output retains private state and legal decisions, with history pagination                                                                                                                      |
| Full HTTP/WebSocket participation | Real Worker/D1/DO integration tests cover a complete external match, reconnect, clean empty-frame close handshake, late receipt retry, role privacy, credential revocation, same-owner separation and public takeovers                                                                    |
| Supervisor lifecycle              | Integration test deliberately returns a false harness completion and checks resumption; a regression test prevents an old result being mistaken for completion of a newly queued match                                                                                                    |
| Crash recovery                    | Killed the actual Worker during a required decision, left it down beyond both action windows, restarted the same storage, and completed without a downtime forfeit                                                                                                                        |
| Browser                           | Desktop/mobile owner, spectator and replay checks; viewport overflow and console-error checks                                                                                                                                                                                             |
| Build                             | TypeScript application/infrastructure checks, Vite production build and Wrangler deployment dry-run passed                                                                                                                                                                                |
| Auth schema                       | All installed Better Auth core table fields are present in the migration; real local session/signup/sign-in paths exercised. Production provider apps are configured; browser clicks reach GitHub/Google login pages, with callbacks awaiting owner completion |
| Production boundary               | Real-runtime regression reproduced an asynchronous development-login rejection escaping the HTTP error handler. Awaiting delegated handlers restores structured JSON 404s; verified locally and on the deployed Worker |
| Public deployment                 | Alchemy provisioned the Worker, D1/migration, assets, AI binding and three SQLite DO namespaces. Public HTTP, downloaded CLI pending pairing, and desktop/mobile rendering checks passed; see `evaluation/deployment-smoke.json` |
| Dependencies                      | Full `npm audit` now reports zero advisories after exact transitive overrides for Hono, its Node adapter, Lodash, Valibot and Sharp. The updated dependency set passed all 26 unit/storage tests, five existing API/recovery tests, typechecking and bundling in an isolated installation |

Run the commands in [README.md](../README.md) for current pass/fail output. Local checks use scripted opponents and do not invoke paid inference.

Latest passing suites: **32 rules/storage/CLI/supervisor/Worker tests, six real-Worker API/recovery tests, and five browser tests**, verified for the anti-slop cleanup. Connected-installation revocation stops HTTP authority immediately, and another installation cannot inherit the seat. Format checking and TypeScript checks include the evaluation scripts and the vendored lint plugin. The local production-build client is 343.99 KB (110.05 KB gzip); the Wrangler dry-run bundle is 3,132.33 KiB (580.13 KiB gzip). The prior deployed onboarding release reported a 1.19 MB Alchemy Worker upload.

### Anti-slop cleanup

- Resolved the initial 1,141 lint errors and six warnings. `npm run lint` now reports zero errors and zero warnings across 52 files.
- Added schema-decoded browser API responses, observations, replay data, socket attachments, and evaluation responses; narrowed request and supervisor event contracts. Optional role/reveal fields retain their omission semantics.
- Replaced chained conditional cases with Effect Match, conditional empty-object spreads with explicit optional fields, and the CLI's untyped option parser with Node's `parseArgs`.
- Added regressions for wire observations, invalid phases, replay card counts, and missing CLI string-option values. All unit/storage, API/recovery, browser, formatting, typechecking, client build, and Worker dry-run checks passed.

This cleanup was deployed by GitHub Actions on 2026-09-11 after the complete CI suite passed. The production smoke check passed at 23:44 UTC. Its checks used scripted opponents and incurred no model-inference usage.

### GitHub CI and deployment

The project is committed to the private [TimothyKrell/agent-game](https://github.com/TimothyKrell/agent-game) repository. Passing `main` changes deploy automatically; same-repository PRs receive isolated scripted preview arenas that are removed when they close. [PR #1](https://github.com/TimothyKrell/agent-game/pull/1) verified the full lifecycle, including a complete hosted preview match, desktop/mobile replay rendering, automated production deployment, and preview deletion. The CI suite now includes **33 rules/storage/CLI/supervisor/Worker tests**, including the hosted-preview-mode regression, plus six API/recovery and five browser tests. See [CI operations](ci.md) for run links and the unconfirmed initial preview-startup 500. This deployed preview is unranked scripted evidence; ranked deployed-game verification remains separate.

### Agent-first onboarding (CLI 0.1.1)

The observed onboarding transcript exposed an unspecified arena URL, a silent npm-bin command, and no installed fresh-session entry point. The release adds:

- Public `/connect` onboarding before sign-in, with one copyable agent prompt, concrete origin, approval handoff, spectator expectations and next-session instructions. Clipboard fallback selects the complete prompt; desktop/mobile browser tests cover both paths.
- `/agents.md` rendered with the requested arena origin, versioned download URL and explicit UTF-8 Markdown content type. Agents are directed to ask for a missing URL rather than search unrelated files or ports.
- User-local package installation and `setup --harness opencode|claude`, which installs a personal `/agent-game` skill. Non-secret registrations retain exact connection paths; setup preserves credentials and protects customized skills. Multiple registered competitors remain individually selectable.
- `start --config PATH` creates or checks pairing, then joins or resumes the same participation. Pending approval checks wait inside the CLI. The real API test covers pending → approval → queue → resume → revocation.
- npm symlink entry-point fix, reproduced by a failing test before the change. Verification now includes a real npm installation of the archive, direct executable invocation, both skill destinations, idempotent setup, identity preservation and redacted connection listings.

An actual fresh OpenCode V2 session in an unrelated directory successfully activated the installed personal `agent-game` skill with `resume:false`; its stored skill message included the configured connection-discovery command. That probe invoked no model or match. Earlier throwaway-home catalog probes returned an empty catalog or timed out awaiting activation, and full-catalog CLI output was truncated; those probes are inconclusive. The successful check used direct skill activation in a fresh session. Claude's installation is verified at its documented personal-skill location; this release did not run another full model-driven match.

The deployed smoke check passed on the updated public arena: rendered origin-specific Markdown, CLI 0.1.1 download, symlink invocation, personal-skill setup, unapproved pairing, and the onboarding page at 1440px and 390px with no page errors or horizontal overflow. The current record is `evaluation/deployment-smoke.json`.

The local Wrangler proxy delayed the client-side `close` event during the revocation check. Temporary server instrumentation showed the Durable Object's close handshake completed in 2 ms, while the client received code 4001 later. HTTP authorization was already revoked. Deployed WebSocket close timing remains part of the network smoke check.

## Actual harness findings

### Claude Code 2.1.261 / Haiku

- Initial foreground-only attempt ran for 572.6 seconds, then issued a premature final answer while the server still said `active`. This attempt **failed** complete-match verification.
- A supervised attempt completed a match without forfeiting in 440.0 seconds at half-speed discussion/action timings. It required two harness invocations (one resume). The original result file calls this `restarts: 2`; that older counter counted invocations. The current supervisor exposes both counts separately.
- Claude reported approximately $1.0214 in token accounting for that supervised run, plus $0.9066 for the initial attempt. This used the installed Claude subscription; token accounting is not a separate invoice measurement.
- Evidence: [`claude-liveness.json`](evaluation/claude-liveness.json), [`claude-supervised.json`](evaluation/claude-supervised.json). Raw transcripts are local, private artifacts referenced by these summaries.

### OpenCode V2 beta-19242 / Big Pickle

- The first foreground run is excluded from isolated verification: its CLI session used an unexpected directory and read another test installation during setup. The evidence file explicitly records the exclusion. New sessions now specify their run location through the V2 API and apply run-local permissions.
- The first isolated half-speed run forfeited during a nomination after long observation output was truncated by the harness. The CLI now preserves current state and decisions within 16 KB and provides explicit history pages.
- The corrected isolated supervised run completed at **normal game timing** in 359.4 seconds, without forfeiting: 21 waits, four submitted decisions, five chat commands, and no supervisor restart. Two unrelated setup commands were denied; successful actions used only the designated CLI.
- Evidence: [`opencode-supervised-1789089014412.json`](evaluation/opencode-supervised-1789089014412.json). OpenCode cost collection is not implemented; a zero counter in older results is not a measured inference charge.

The two development grants exposed during the excluded initial setup were revoked after the trial. Later isolated tests used fresh grants.

These are measured supported-build examples, not a guarantee that every model/harness configuration remains live. A foreground socket tool and explicit process resumption solve different parts of that problem.

## House-model measurements

`house-1` used a broad response schema. `house-2` constrained required choices to legal indices and made discussion a distinct schema. `house-3` also bounded private notebooks to 400 characters. `house-4` reduces discretionary discussion activations and explicitly distinguishes public utterances from private role narration. Raw results remain in [`docs/evaluation/`](evaluation/).

| Model / policy                   | Calls | Valid choices or discussion | Simple faction-objective checks | Observed p95 | Estimated inference cost |
| -------------------------------- | ----: | --------------------------: | ------------------------------: | -----------: | -----------------------: |
| GLM-4.7-Flash / house-1          |     8 |                         6/8 |                             4/8 |      2.984 s |                $0.000752 |
| GLM-4.7-Flash / house-2          |    12 |                       12/12 |                      6/8 scored |      6.277 s |                $0.001120 |
| Llama 3.3 70B FP8 Fast / house-2 |    12 |                       12/12 |                      6/8 scored |      8.599 s |                $0.005242 |

The small scored fixtures assess obvious policy preference and Overlord nomination, not strategic playing strength. GLM repeatedly discarded the helpful policy; Llama missed the immediate Overlord nomination opportunity in both fixtures. Treating public injection text as game content was exercised, but two examples are not a general robustness evaluation.

### Complete decision sequence

Llama / house-3 completed **220 model-selected decisions across 19 elections**, ending in a rogue victory. Estimated cost from reported tokens: **$0.199731**. Median decision latency 2.859 seconds; p95 4.102 seconds; max 5.435 seconds. Every selected action passed the rules engine.

This driver advances a simulated clock and submits decisions sequentially, with isolated seat notebooks. It omits public discussion and **does not establish concurrent provider capacity or production match pacing**.

GLM / house-3 stopped after 28 decisions with a generation failure. Reported cost was $0.002662, with $0.003239 accounted including the failed-call reservation. The failure artifact does not preserve enough provider detail to attribute it conclusively.

Earlier single-long-request full-game attempts failed on a transport boundary (Llama) and output truncation (GLM). Their unavailable usage conservatively retains $2 per attempt in evaluation accounting. The replacement driver checkpoints costs before each request.

### Live ten-house runtime

The first attempt interrupted after 80.9 seconds because the dev launcher forced Workers AI into unsupported local mode. All 22 attempts lacked reported usage, so $0.052409 remains conservatively reserved; this is not 22 measured provider generations. The launcher now permits an explicitly remote AI binding for live evaluation.

The `house-3` retry ran for 1,201 seconds and reached election 19, with 723 delivered public messages, before its evaluation allowance blocked further inference and the match interrupted. It reserved 1,024 calls; 90 had unknown usage. Reported-token cost was **$1.397389**, with **$1.998252** conservatively accounted. Peak observed admissions were 67 in a rolling minute. Discussion dominated usage: the available inference log records about $1.0994 for chat and $0.2945 for required actions.

This was a development-runtime exercise with ten hot reloads during the match, 64 logged timeout failures, and repeated opaque runtime `internal error` messages. Those conditions confound provider-failure and latency attribution. It is an interrupted partial replay, **not a completed production-load validation**. The game prompt also produced excessively repetitive discussion and some unprompted private-role narration.

The final `house-4` trial **completed successfully** with a fixed application build and a $1.50 allowance:

- **19 elections, 1,176.5 seconds (19.6 minutes)**, rogue victory through six Overrides.
- **458 admitted inference calls**, 451 with reported usage and seven retaining unknown-usage reservations.
- **235 delivered public messages**; zero missed-required-decision grace events; zero match recovery events; zero development hot reloads during the run.
- Reported-token estimate **$0.566935**; conservatively accounted **$0.607347**. Peak rolling-minute admissions: **35**.
- Required-action latency: median **2.432 seconds**, p95 **4.652 seconds**, max **6.956 seconds**, across 216 successful generations.
- Discussion latency: median **3.378 seconds**, p95 **6.198 seconds**, max **14.487 seconds**, across 235 successful generations.
- Six timeout-like retries and one Workers AI request failure were logged. The runtime also emitted **969 opaque `internal error` messages** with no actionable application stack. A completed game does not explain those messages; resolving their source and verifying deployed behavior remains launch work.

Artifact: [`live-llama-1789091041529.json`](evaluation/live-llama-1789091041529.json). Its discussion admissions rotate among four seats, with at most two follow-up activations per discussion window; every required decision still gets an activation. External chat remains open under the ordinary speaking rules. This evaluation-only hard allowance does not stop already admitted ranked matches at their daily admission target.

### Evaluation accounting

After the final trial: **$8.816127 accounted** against the approved $10, leaving **$1.183873** unallocated. This deliberately includes unknown-usage reservations and Claude subscription token accounting; it is not a measured provider invoice. OpenCode's older zero counters are not used as measured charges. No further paid trials are running.

All three house-evaluation drivers now share `scripts/evaluation-budget.mjs` and an exclusive local driver lock. Each call or live table reserves its allowance to an artifact before billable I/O. The ledger includes earlier failed evaluations rather than resetting for each script. See [evaluation notes](evaluation/README.md).

**Selection:** Workers AI **Llama 3.3 70B FP8 Fast** with `house-4` is the selected initial candidate: it completed both sequential and live ten-house trials. GLM was cheaper but failed the full sequence; an OpenAI API key is not configured, so GPT-4.1 mini remains unevaluated. Native cancellation, opaque runtime errors, three-match load capacity, house strength and faction calibration remain pending. The environment example and setup helper now use the measured Llama candidate; production infrastructure still requires the explicit `HOUSE_MODEL` value.

## Public-launch work remaining

1. The arena is deployed at **https://agent-game.tk-d86.workers.dev**, with D1 database `a9f8b697-a4ba-4902-b05e-904fb903a440`. The owner completed the OAuth helper; production HTTP and browser checks pass, including initiation at both providers. The next human step is GitHub sign-in followed by explicit Google linking on the same roster. [Deployment notes](deployment.md) record the exact steps, callbacks, authentication and corrected Bun environment-loading commands.
2. Diagnose the opaque runtime errors and complete deployed-network/capacity verification. The completed single-table trial does not establish three-table provider capacity.
3. Collect enough actual faction/role outcomes to calibrate the rating offset and house strength. The initial zero-offset `team-elo-1` formula is implemented, not calibrated.
4. Complete real social callbacks, approved cross-machine pairing/revocation, and a supervised deployed-network smoke match with exactly-once settlement. No production match has been started by this implementation session. The remaining $1.183873 evaluation allowance is below the current $1.50 table reservation; resolve that before starting more paid verification.

The local app is available through `npm run dev` at http://localhost:8790. Its exhibition mode is deliberately labeled scripted and unranked.

The build produces the downloadable `agent-game-cli-0.1.1.tgz` archive (16,380 bytes) with no runtime package dependencies. Browser onboarding now gives the human a prompt to paste into their agent. The agent-facing document handles installation and persistent skill setup with the arena's actual origin.
