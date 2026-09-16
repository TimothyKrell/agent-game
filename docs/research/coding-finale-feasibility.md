# Secret Overlord coding finale — feasibility, 2026-09-15

## Recommendation

**Prototype an original, bounded coding challenge with independently checked hidden tests and partial-credit milestones. Do not assume an archived Advent of Code puzzle will provide a suspenseful race, or that increasing algorithmic difficulty alone will do so.** Strong algorithmic performance is established for particular AI systems; an entertaining time-to-correct-solution distribution for this game's actual competitors is not. Measure that distribution before choosing the finale deadline or making it override the social game's outcome.

This note separates published evidence from proposed game design. Research used primary papers, project pages, and first-party experiment reports, inspected on **2026-09-15**. The repository convention is a dated recommendation, explicit provenance, findings, and linked sources. No model evaluation was run. Results from 2024–2025 are evidence for their named checkpoints and harnesses, **not verified results for later models available in September 2026**. This is a focused feasibility review, not a current-model leaderboard census.

## Published evidence

### Subsequent owner decisions from the design interview

These decisions refine the recommendations in this note. The owner subsequently requested that implementation begin; the first executable slice is documented in `docs/design/coding-finale.md`.

- Create a new game whose first act reuses the full Secret Overlord rules and Succession's match layout/style. All existing faction-victory routes end Act 1.
- The new game will be the sole launch offering. Older-game cleanup is deferred in [TIM-45](https://linear.app/tims-stuff/issue/TIM-45/plan-and-carry-out-older-game-cleanup-for-the-coding-finale-launch); exact cleanup scope remains undecided.
- Only surviving seats of the winning faction qualify for the coding finale. Executed seats do not return. This supersedes the return-all-winning-members recommendation below.
- One mechanical champion wins the complete match. Existing takeover and forfeit semantics continue: a replacement-controlled seat can win mechanically without restoring the original entrant's win credit.
- Finalists submit programs evaluated against unseen tests. Provide common Cloudflare-hosted development tools and separate isolated judging; outside agents' thinking resources are not assumed equal.
- Use one shared problem with two sequential tiers. Tier 2 remains hidden from a finalist until its Tier 1 submission passes. This supersedes the earlier both-visible recommendation. The earliest passing Tier 2 submission wins.
- Use a five-minute shared submission window, targeting roughly 3–5 minutes of finale play subject to calibration. Tier unlocks do not reset the clock. At timeout, the earliest passing Tier 1 submission wins if no Tier 2 submission passes; if nobody passes either tier, use the finalist priority committed before the race. Judging of accepted entries has a bounded completion window.
- Support JavaScript/TypeScript for the first version, replacing the proposed Python choice. Permit ten formal submissions total per finalist, one in flight at a time, and bounded hosted practice runs. Keep hidden test inputs/expected answers private.
- Finalists may chat publicly; other seats are read-only spectators. Source stays private during the race. Use curated original families with seeded generators and trusted reference solvers, starting with scheduled network routing.
- The earliest complete submission received by the match server that passes the required tests wins. Judge completion order does not decide race placement.

### Research evidence

| Evidence | What it establishes | What it does not establish |
| --- | --- | --- |
| OpenAI's February 2025 paper reports an early o3 checkpoint at estimated Codeforces rating **2724**, versus o1 at **1673**. Its evaluation allows ten submissions, and the detailed o3 table includes ranking from 1,162 samples. [S1, §§2.1, 4.1, Appendix B] | Strong competitive algorithmic problem solving already existed in these evaluated systems. | A single ordinary API request has this rating, or an AoC problem will be solved in seconds. |
| A later o3 checkpoint scored **395.64/600** on the six IOI 2024 problems in retrospective evaluation. It selected 50 solutions with the highest test-time compute from **1,024 samples per problem**. The live o1-ioi system scored **213**, while its **362.14** gold-threshold result required relaxing the submission limit to 10,000. [S1, §§3.4, 4.2] | Submission limits, selection, and inference budgets materially affect results. | “IOI gold” is one uniform result, one-shot accuracy, or a latency guarantee. |
| DeepMind's September 17, 2025 report says an **advanced Gemini 2.5 Deep Think** system solved **10/12** ICPC World Finals problems: eight within 45 minutes and two more within three hours, inside a five-hour limit. It used multiple agents, terminals, tests, and iterative solutions. [S2] | A first-party report includes actual contest-time milestones, not just a success rate. | Those times describe the public lightweight Deep Think product, one agent, a later Gemini release, or our game harness. DeepMind explicitly says ICPC confirmed accepted solutions but did not validate its system, processes, or model. |
| ICPC-Eval v1, June 2025, evaluates **118 problems** with up to five feedback-based attempts. **o3-mini High: 28.8%; Gemini 2.5 Pro Experimental: 22.0%; DeepSeek R1: 14.4%** on Refine@5. [S3, §§3–4] | Difficult contest sets remained discriminating for these checkpoints and this harness. | These are limits of all modern models. The paper's “best” model is o3-mini, not the o3 checkpoints in S1 or the advanced system in S2. |
| In ICPC-Eval, computational geometry and search were particularly difficult: o3-mini High achieved **17.6%** and **16.7%**, respectively. [S3, Table 3] | These are reasonable candidate areas to investigate. | Every geometry/search puzzle is hard, or the same ordering holds for 2026 models. Categories overlap and subset counts are small. |

### Advent of Code specifically

Direct AoC evidence found here is weaker than the competitive-programming papers. A December 23, 2025 experiment on Armin Ronacher's own site reports Claude Code completing all 12 days of AoC 2025 with browser access, followed by optimization and generated-input work. The post is explicitly **AI-written**, and Ronacher's human-authored postscript confirms the experiment setup and prompt. It links the solution repository. Treat this as an artifact-backed first-party case report, not a controlled multi-model benchmark or independent replication. It does not identify a precise evaluated model snapshot or report a solve-latency distribution. [S4]

Crucially, that experiment's **“under one second” target is the total runtime of already-written solution programs**, after optimization. It is not how long the AI took to read, reason, write, debug, and submit them. AoC's own statement that each problem has a solution completing within 15 seconds on ten-year-old hardware also concerns **program execution**, not problem-solving time. [S4, S5]

**Conclusion supported by this evidence:** an AoC-style coding finale is technically plausible, and familiar/static puzzles may offer little differentiation for strong agents. **Not supported:** all AoC problems are trivial for all current models, or a typical race will finish in a specified number of seconds. No controlled AoC time-to-first-correct benchmark sufficient to set that deadline was verified in this review.

## Contamination and reproducibility

**Evidence.** LiveCodeBench deliberately timestamps newly released LeetCode, AtCoder, and Codeforces problems, enabling evaluation after a model's training cutoff. Its authors report a marked drop for the evaluated DeepSeek models on LeetCode questions published after their release, indicating possible earlier contamination. This supports temporal evaluation; the static project overview is not a September 2026 leaderboard. [S6]

OpenAI reports post-training-cutoff test contests plus embedding-based checks for its Codeforces evaluation; it separately describes the different data cutoff for the IOI o3 checkpoint. [S1] These are documented contamination controls, not independent audits of every model's training data.

In controlled contamination experiments across ten models, five benchmarks, and twenty mitigation strategies, Sun et al. found no tested strategy that effectively balanced fidelity and contamination resistance across the evaluated settings. Semantic-preserving rewrites did not reliably remove the problem; changing semantics changed the evaluation task. This study is broader than AoC and should not be presented as an AoC-specific measurement. [S7]

**Recommendations.**

- Author original specifications, generators, and test oracles. Keep a genuinely unseen holdout of puzzle families for calibration, not only new seeds of the same familiar template.
- Randomize structural constraints as well as values when testing generalization. Merely changing names or integers may prevent answer reuse while leaving a memorized solver intact. Familiar algorithm knowledge is legitimate ability; direct access to this instance's answers is a different issue.
- Use identical instances and release times for racers, or explicitly validate equivalent difficulty if giving different instances. Random seeds alone do not establish fairness.
- Freeze and record model identifier, reasoning settings, prompt, tools, language/runtime, sampling/concurrency budget, submission limit, and puzzle/checker versions. Recalibrate when any changes.
- Decide whether external retrieval is allowed. With unrestricted external agents, inability to inspect their execution means a game should not claim a verified closed-book comparison.

## Latency: what must be measured

The OpenAI paper is unusually explicit: its primary Codeforces score uses the **median score of human solvers with the same failed-attempt count**, rather than the model's measured submission time. It says actual parallel submission time depends on available GPUs. Consequently **2724 Elo cannot be converted into seconds-to-solve**. [S1, Appendix B.3]

For a game, distinguish:

1. Reveal/delivery and provider queue time.
2. Model reasoning and code generation.
3. Tool startup, compilation, program execution, and local debugging.
4. Submission transport, server receipt, and authoritative checking.

**Proposed calibration, not observed results:** build a small original bank spanning several difficulty levels; run the intended agent configurations repeatedly under the intended deadline and concurrent load. Record first correct submission time, solve fraction by elapsed time, censored failures at deadline, partial-score trajectories, retries, cost, and infrastructure overhead. Do not report only median time among successes: it hides unsolved tasks. Keep answer-program CPU runtime separate from end-to-end solving latency.

Choose the deadline after seeing these curves. If almost every run solves immediately, the finale measures provider/transport speed; if almost none solves, it becomes a timeout lottery. Both are hypotheses to test, not reasons to assign an arbitrary harder Codeforces rating.

## Tougher, useful puzzle families

The following are **design recommendations**, motivated by the evidence rather than demonstrated 2026 model weaknesses. All require independent generator/checker validation and a measured difficulty curve.

| Family | Why it may make a useful finale | Objective judging and difficulty control |
| --- | --- | --- |
| Graph routing with an extra state dimension | Simple to narrate as escaping or disabling the Overlord; requires composing shortest paths with keys, cooldowns, capacities, or timed access. | Exact small-instance oracle; state-space size and rule combinations define tiers. Give partial credit for simpler constraint groups. |
| Bounded scheduling, packing, or resource allocation | Produces visible progress and meaningful improving solutions instead of only solved/unsolved. | Independently verify feasibility and compute objective score. Use known optima for bounded instances or explicitly score relative quality; avoid claiming optimality without an oracle/certificate. |
| Geometry with exact integer predicates | Historically difficult in S3, with visually understandable containment/intersection failures. | Include degeneracies and adversarial cases; prefer exact arithmetic over ambiguous floating-point tolerances. Calibrate before making this the default. |
| Small program repair or constraint-changing optimization | Tests understanding and validation in addition to recognizing a stock algorithm. S6 explicitly evaluates repair as distinct from generation. | Supply a compact original implementation and full public specification; judge hidden regressions and resource bounds. Avoid large setup/dependency costs. |
| Interactive system diagnosis | Naturally connects information gathered during social play to a final technical objective. | A deterministic simulator can expose limited probes and score a final repair/plan. Requires a larger protocol surface; this research does not establish that interaction itself is harder for current models. |

For the first prototype, prefer **graph-state composition or bounded optimization** over an arbitrary olympiad-hard puzzle. They support clear spectacle, independent checking, and adjustable difficulty. A two-stage structure can provide an attainable first milestone and a harder extension. Subtask scoring already has a concrete precedent in IOI evaluation. [S1]

If earlier Secret Overlord decisions should matter, let them determine explicitly bounded resources, clues, or starting objectives, and measure the resulting advantage. This is a game-design proposal, not a discovered repository behavior. A pure first-correct race risks replacing the social outcome with a coding/provider contest. The parent session should decide the intended relationship.

## Advent of Code reuse terms

AoC's own FAQ says it is **free to use, not free to copy**, and asks repositories not to include puzzle text or personal inputs. It also asks new websites not to imitate its appearance or use a similar name. Its Legal section reserves rights to its design elements, language, styles, and concept absent express written consent, identifies the registered trademark, and expressly allows linking to or referencing puzzles even in commercial contexts. It does not claim ownership of participants' solution implementations. [S5, FAQ copying and Legal]

**Recommendation:** use original puzzles and distinct branding; link to AoC as inspiration. Seek explicit permission before importing its text, inputs, or other protected material. Public solution repositories do not grant rights to the underlying AoC content. AoC also explicitly discourages using AI to solve its puzzles and says puzzle design makes no allowance for what AI can solve; it is not designed as an AI benchmark. [S5, FAQ AI]

## Repository architecture findings

Source review on 2026-09-15 supports **reusing the match authority and two-act pattern, with a new coding execution/judging subsystem**. This is a feasibility assessment, not an adopted rules contract or implemented feature.

| Existing capability | Evidence and implication |
| --- | --- |
| Secret Overlord can be the first act of a longer match | [Succession engine](../../src/game/succession/engine.ts) reuses the original engine and translates victory into an act-ended fact. The [existing contract](../succession-contract.md#rules-and-authority) covers all four victory routes and an atomic transition without premature rating settlement. A coding finale has a concrete local precedent. |
| One match owns authoritative state and receipts | [MatchObject.submit](../../src/server/match.ts) authenticates the seat, checks retry fingerprints, and atomically evolves state and inserts receipts with SQLite `transactionSync`. A new race can durably order submissions here. Current receipt rows do not already provide coding submission order or judge status. |
| Concurrent decisions and live delivery exist | [RuntimeInspection](../../src/game/contracts.ts) exposes multiple pending seats; [house dispatch](../../src/server/match.ts) creates per-seat decision jobs; [protocol 2](../../public/games/succession/protocol.md) supports entitled live snapshots and reconnects. A race need not become a turn-taking loop. Simultaneous delivery to geographically separated clients is still not guaranteed. |
| Game adapters are closed and explicitly typed | [Registry](../../src/game/registry.ts) and [descriptors](../../src/game/descriptors.ts) enumerate two games and their action/observation/result types. A coding variant needs deliberate changes to those contracts, protocol, observations, deadlines, ratings, and clients. It is not a runtime plugin slot. |
| House agents currently choose actions rather than execute programs | [House model](../../src/server/house-model.ts) uses structured choice/message/notes responses, 512-token output limits, and no tool loop in the native adapter. Coding needs a different response/tool workflow and an explicitly calibrated inference budget. |
| Supervised external agents have a restricted tool surface | [Supervisor](../../cli/supervisor.mjs) grants Claude Bash access to the game CLI and configures OpenCode to deny tools except the CLI shell command and connection-directory access. The hosted solve/test workflow or local coding permissions must be added intentionally; the underlying coding harness's capabilities are not automatically available during supervised play. Custom external orchestrators may have different capabilities. |
| Current observations/history are bounded | [Protocol 2](../../public/games/succession/protocol.md) limits current observations to 14,336 bytes and defines paged history/replay. Large inputs, programs, and test logs should use a separate artifact surface with bounded references and judge events in current state/history. |

Cloudflare documents transactional, strongly consistent per-object storage and synchronous transaction callbacks [S8]. It also offers isolated, container-based code execution through Sandbox [S9], making a Cloudflare-hosted judge plausible. Neither source establishes this project's cold-start latency, required capacity, cost, or judge correctness.

### Proposed race and judging semantics

1. Atomically transition from Act 1 to a preparation stage, preserving participants and controller authority. Determine eligible finalists and the challenge version. Prepare execution capacity, then release the challenge at a server-owned start and set a bounded deadline.
2. On each complete submission, commit an immutable program/artifact identity, challenge ID, seat/controller generation, server receipt time, monotonic receipt sequence, and retry-stable action ID. Receipt ordering belongs to the match authority, not client clocks.
3. Dispatch isolated judging outside the match's synchronous transaction. Use fixed runtime/resource limits, hidden test groups, and a trusted checker outside the submitted program's authority. Persist result identity and reject duplicate or stale judge callbacks.
4. Define the winner as the **earliest server-received submission that passes the required judge**. A later submission whose judge finishes first is provisional until earlier candidates have failed or hit their execution limit. Rate-limit attempts and bound judging so an early nonterminating program cannot indefinitely stall resolution. A platform judge failure needs recovery/interruption semantics rather than being silently scored as an agent failure.
5. At the race deadline, stop accepting entries and finish judging eligible pre-deadline submissions. If no complete solution passes, use explicitly published subtask scores and tie-breaking rules. Commit one overall result and rating settlement.
6. Publish bounded progress such as submission, judging, and milestone events. Keep source and solution-bearing details private while racing; publish appropriate artifacts and judge evidence for the final replay. Correctness here means passing a specified executable judge, not a proof over every possible input.

This separates solving speed from judge queue speed. A wall-clock race still measures the whole competitor stack: model latency, tool use, compute, delivery, and networking. Shared judge hardware standardizes program evaluation but does not equalize external agents' thinking resources. Benchmark under concurrent load and prewarm shared execution capacity before interpreting close finishes.

### Product decisions and first experiment

- **Act 1 stakes:** a clear starting design is that the winning faction qualifies for an individual coding final. Decide explicitly whether executed faction members return. Keeping all ten eligible instead would require a meaningful, measured Act 1 advantage to preserve the social game's stakes.
- **Submission contract:** AoC-style answer-only judging is a smaller experiment: agents compute externally and submit an answer the server can check. This does not verify a submitted program generalizes. A true coding contest submits a program and evaluates unseen inputs, requiring the execution boundary above. Both require a usable coding workflow for the currently restricted supervised agents.
- **Pacing:** aim experimentally for a few-minute finale with visible milestones and a hard cap; these are design targets, not measured model solve times. Start with one original network-routing family, a reliable reference solver, hidden test groups, and several difficulty tiers. Evaluate the actual house and external configurations, including timeouts, before selecting the tier and deadline.
- **Spectacle:** show observable progress and submitted artifacts rather than relying on access to agents' private reasoning. A two-stage challenge can create a lead change while retaining objective scoring.

## Sources

- **S1 — OpenAI, _Competitive Programming with Large Reasoning Models_, February 18, 2025, v2.** [Paper](https://arxiv.org/html/2502.06807v2). Especially §§2.1, 3.4, 4.1–4.2 and Appendix B.2–B.3. First-party research; named experimental checkpoints and explicit sampling/rating methodology.
- **S2 — Google DeepMind, _Gemini achieves gold-medal level at the International Collegiate Programming Contest World Finals_, September 17, 2025.** [Report](https://deepmind.google/blog/gemini-achieves-gold-medal-level-at-the-international-collegiate-programming-contest-world-finals/), [published solution repository](https://github.com/google-deepmind/gemini_icpc2025). Provider report; its final paragraph limits what ICPC independently confirmed. Use the article's date, not search-engine crawl metadata.
- **S3 — Xu et al., _ICPC-Eval: Probing the Frontiers of LLM Reasoning with Competitive Programming Contests_, June 5, 2025, v1.** [Paper](https://arxiv.org/html/2506.04894v1). §§3–4 describe datasets, feedback, exact model IDs, and Refine@5. The test-generation validation against selected incorrect programs is useful evidence, not proof that every unseen incorrect program is rejected.
- **S4 — Armin Ronacher's experiment, _Advent of Slop: A Guest Post by Claude_, December 23, 2025.** [Case report and human postscript](https://lucumr.pocoo.org/2025/12/23/advent-of-slop/), [linked solution repository](https://github.com/mitsuhiko/aoc25). AI-written narrative hosted by the experimenter; distinguish claimed completion and solution runtime from controlled benchmarking.
- **S5 — Eric Wastl / Advent of Code, About, FAQ and Legal.** [Official page](https://adventofcode.com/about), [copying FAQ](https://adventofcode.com/about#faq_copying), [AI FAQ](https://adventofcode.com/about#faq_ai). Live page observed with 2025 event navigation and copyright notice.
- **S6 — Jain et al., LiveCodeBench.** [Authors' project page](https://livecodebench.github.io/), [paper](https://arxiv.org/abs/2403.07974). Temporal splits, contamination observations, generation/repair/execution/output-prediction scope. Historical overview text, not an asserted current leaderboard.
- **S7 — Sun et al., _The Emperor's New Clothes in Benchmarking? A Rigorous Examination of Mitigation Strategies for LLM Benchmark Data Contamination_, ICML 2025.** [Official proceedings and abstract](https://proceedings.mlr.press/v267/sun25t.html). Controlled evidence on limitations of benchmark rewriting; not AoC-specific.
- **S8 — Cloudflare, SQLite-backed Durable Object Storage.** [Official reference](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/). Transactional storage, SQL, and synchronous transaction requirements; inspected 2026-09-15.
- **S9 — Cloudflare, Sandbox SDK.** [Official overview](https://developers.cloudflare.com/sandbox/). Isolated container execution integrated with Workers; inspected 2026-09-15. A candidate execution product, not an implemented judge or a latency/cost measurement.

## Verification record

Documentation-only research: primary pages above were fetched directly; linked solution repositories are artifact pointers, not locally executed reproductions. No production code, dependency files, or model evaluations were changed/run. No quantitative latency estimate for this game's contestants is established.
