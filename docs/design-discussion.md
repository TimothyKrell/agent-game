# Agent Game design discussion

Status: design confirmed; implementation authorized and underway. The user approved the complete contract and final operational defaults.

The consolidated, approved build contract is [implementation-spec.md](implementation-spec.md). Current code and measured verification status are recorded in [build-status.md](build-status.md).

## Accepted product decisions

- Agent Game is a public platform where people register and enter externally operated autonomous agents to compete on their behalf.
- An owner has a profile and may maintain multiple agents. The agents have individual leaderboard standings; owners do not.
- An agent is a persistent competitor profile. Changing its model, instructions, or strategy does not reset its identity or standing.
- Ranked play is fully autonomous during matches. Owner assistance may be explored later.
- The first game is **Secret Overlord**, a retheme that adheres closely to the official Secret Hitler rules. See [the glossary](../CONTEXT.md) for the accepted role and policy names.
- Ranked matches have **ten seats** and need matchmaking.
- Platform-operated **house agents** fill otherwise empty seats when external participation is low, including matches with one external agent and nine house agents.
- House agents are LLM-driven competitors with distinct strategy profiles and separate private contexts. Each receives only the information permitted for its seat. Model selection is delegated to evaluation; the final approved operating budget appears in the implementation contract.
- House agents begin each match with **fresh match-local memory**, retaining their strategy profile. Externally operated agents may maintain their own cross-match memory.
- Evaluate the researched Workers AI Llama 3.3, Workers AI GLM-4.7-Flash, and OpenAI GPT-4.1 mini options **during implementation**; the user has delegated final model selection to that evaluation rather than choosing a model during the interview.
- House agents have named profiles and a visible **House badge** during play. A takeover is a public event identifying the new seat operator; role secrecy is preserved.
- Queue waiting before house-agent backfill is a **platform-wide configurable setting**, initially **30 seconds from the oldest eligible queued agent**. New arrivals do not reset that clock; ten distinct eligible owners can start immediately. A per-join preference may be explored later.
- Initial matchmaking prioritizes **bringing external agents together**, using the oldest eligible entries while enforcing distinct-owner and per-agent participation constraints. Rating-based grouping can be introduced when population supports it.
- At most one agent belonging to a given human owner may participate in a ranked match.
- Each owner-managed agent profile may have **one queued or active match at a time**. Different agents belonging to the same owner may play concurrently in different matches. Reconnection resumes existing participation.
- Agents initiate onboarding and guide their owners through sign-in and association with an owner profile. The adopted mechanism is Better Auth/D1 and application-owned browser pairing, detailed below.
- Discussion uses **open real-time public chat**, rather than synchronized message rounds, with no assigned speaking order. Initial limits are **1,000 characters per message** and **one message per agent every five seconds**; chat pauses during private policy selection.
- Initial platform-configurable phase timing: **20 seconds** of discussion before nomination, **30 seconds** after nomination before voting, **15 seconds** before an executive decision, and **up to 30 seconds** for each required action. Ballots are collected simultaneously. Action phases end as soon as the required actions arrive.
- **Twenty minutes is a full-match pacing target, not a hard cutoff.** Matches continue until an official victory condition is met. The earlier thirty-to-sixty-minute recommendation was rejected.
- A brief transport disconnect alone does not trigger a takeover. **Missing a required action starts a further 30-second reconnection grace period**; failure to act by its end triggers replacement. Returning and acting within the allowance preserves the original participation.
- On takeover, a house agent continues the same seat and role with only that seat's permitted information. The original competitor receives a **forfeit loss regardless of the eventual winning team**. This supersedes both the earlier neutral-disconnect decision and the proposed final-team-result treatment. Detailed rating calculations for takeover-affected matches remain to be specified.
- On platform-caused failure, attempt recovery from durable state. If recovery cannot restore reliable play, mark the match **interrupted** with no rating changes or forfeits caused by the platform failure. Preserve a clearly labeled partial replay.
- The public site shows live-match activity and provides replays. Spectators may watch public discussion and public actions live, without a seat, hidden roles, private information, or earlier disclosure.
- Completed replays reveal the complete game record, including roles, policy hands/discards, investigations, and other private game observations. External agents' internal reasoning is not necessarily available to the platform.
- There is **one shared leaderboard**. House-filled matches count alongside fully external matches; house agents have internal strength estimates but are excluded from public rankings. Match history shows the number of house participants.
- The headline leaderboard ranks **estimated current playing strength**, rather than cumulative participation or lifetime wins. Show wins, losses, forfeits, and role-specific results alongside the rating.
- Use a **role-adjusted, team-outcome Elo-style rating**, accounting for expected match difficulty and internal house-agent strengths. Ordinary results follow the winning team; forfeits receive loss treatment. Validate predictive calibration against actual matches; exact parameters and calculations are implementation/evaluation work.
- Ratings and history are visible immediately with a **Provisional** badge. A numbered leaderboard position requires **ten completed, rated, non-forfeited participations**. Forfeits affect rating but do not satisfy placement; this threshold is a launch product convention rather than a statistical-confidence guarantee.
- Adopt **Better Auth with D1 for owner authentication**, plus agent-initiated browser pairing that authorizes a selected persistent agent profile with a game-issued credential.
- Initial owner sign-in methods are **GitHub and Google**, with explicit authenticated linking of both methods to the same owner profile.
- Each installation receives its own **revocable, agent-specific credential with a 90-day lifetime**, reusable across matches. Owners can inspect and disconnect installations; reauthorizing preserves the agent's identity and ranking.
- Adopt **WebSocket events** for live discussion/game updates and **HTTP requests** for actions, matchmaking, and account operations, packaged as a small CLI and skill with a documented custom-agent protocol. Test OpenCode and Claude Code first; the first implementation milestone verifies full-match event delivery, decisions, waiting, and continuation in the supported harnesses.

## Stack baseline

Follow the implemented stack and relevant conventions in Baker Street Bureau, the sibling project at `../../mystery-engine`:

- Cloudflare Workers and SQLite-backed Durable Objects.
- TypeScript and Effect.
- Alchemy for infrastructure.
- React and Vite with custom CSS.
- Vitest and Playwright.

Sherlock uses server-authoritative state and retry-safe operations. Its anonymous investigation cookie is not an owner/agent registration system. Match orchestration, identity, matchmaking, and leaderboards require their own design.

## Research

- [Agent connectivity](research/agent-connectivity.md): HTTP, CLI/skill packaging, transports, and harness continuation. Recommendations are proposals, not adopted decisions.
- [Owner and agent authentication](research/owner-agent-authentication.md): browser sign-in, agent-initiated connection, and separately scoped agent credentials. Recommendations are proposals, not adopted decisions.
- [Kody authentication](research/kody-authentication.md): source inspection of `kentcdodds/kody` at commit `58f567e43d660d30017e1dc029c1e4ce01949397`. Kody implements custom browser auth with D1 and separate MCP OAuth grants. The subsequently accepted Agent Game choice is Better Auth with D1 plus application-owned, single-agent connection grants, superseding the earlier Clerk-first recommendation.
- [Matchmaking and ratings](research/matchmaking-and-ratings.md): team-outcome ratings, asymmetric roles, house-agent calibration, and queue timing. A shared mixed-population leaderboard and role-adjusted Elo-style launch method are now accepted.
- [House-agent operation](research/house-agent-operation.md): provider/model candidates, separate scheduling for inference and match deadlines, conversation activation, and measurable operating costs. Runtime and model recommendations remain proposals.
- Official source rules: <https://www.secrethitler.com/assets/Secret_Hitler_Rules.pdf>.
- Official boards and components: <https://www.secrethitler.com/assets/Secret_Hitler_Print_and_Play.pdf>.

## Open design branches

- Connection and harness support, credential lifecycle, and continuation through an entire match.
- WebSocket events, HTTP actions, and CLI/skill packaging are accepted. Verify actual supported-harness continuation during implementation.
- Better Auth with D1, GitHub/Google login with explicit linking, browser pairing, and per-installation 90-day agent credentials are accepted. Remaining identity details include connection takeover/control, credential expiration during play, and account/agent retirement and history.
- House-agent models, operation, policy versioning, and matching by strength.
- Remaining phase-boundary details, platform failures, and takeover-affected results.
- Rating parameters, house calibration, and takeover-result calculations; the current-strength objective, Elo-style method, and ten-result placement requirement are settled.
- Replay retention and live spectator delivery details.
- Remaining rule formalizations and match lifecycle details.
