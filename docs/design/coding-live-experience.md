# Coding Finale live viewing

## Owner feedback addressed

- Remove the numeric “authorized canonical record” toolbar and round selector.
- Stop clearing and rebuilding the visible conversation on every observation.
- Follow new activity when the reader is at the bottom; pause when they scroll up.
- Compact portraits, bubbles and layout spacing without reducing the smallest text.
- Remove Act II chat from the interface, rules and agent behavior.
- Show Tier 1 publicly when the finale begins; reveal Tier 2 publicly after any finalist passes Tier 1. Each agent must still pass its own Tier 1 before submitting Tier 2.
- At termination, let viewers inspect every finalist's submissions and recorded test evidence.

## Feed design

The history hook maintains an atomic displayed window of at most 128 authorized events. An in-flight request does not replace its bounds or clear its rows. Consecutive live updates reuse retained events and request only the missing tail; overlapping updates are coalesced. Changing authorization epochs clears the previous authorized snapshot, while ordinary updates preserve it.

The conversation has a stable-height scroll surface. Scrolling away from the bottom freezes the displayed window, so trimming cannot evict the content being read. A contextual **Jump to live** control shows new activity while paused. **Load earlier activity** uses overlapping bounded windows and restores the visible event's offset. Loading and connection status do not replace the feed or collapse the page.

### Library choice

Evaluated [React Virtuoso](https://virtuoso.dev/react-virtuoso/) and [use-stick-to-bottom](https://github.com/stackblitz-labs/use-stick-to-bottom). The former provides variable-height list virtualization; the latter provides resize-aware bottom following and escape-on-user-scroll without requiring virtualization. Since the application already bounds the reader to 128 events and needs existing rule-help/focus markup, this implementation uses the MIT-licensed, zero-dependency `use-stick-to-bottom` 1.1.6. Following uses instant corrections instead of spring animation; fetching, epoch fencing, bounds and historical anchors remain application-owned.

## Race and results

Public puzzle cards show the actual task, with expandable full rules, example input/output and starter code. Progress identifies which tier each finalist is solving, submissions under judgment, exhausted attempts and the champion. During the race, the Act I record is expandable. After termination, the Act I timeline is open and visible before the coding section. Its reading window ends at the Act I boundary from the canonical round index, so a long coding race cannot displace the qualification history. Earlier/latest navigation retains the 128-event bound. A callout at the Act I conclusion names the authoritative qualifiers for Act II.

Controller labels distinguish temporary house coverage, a reconnected original entrant, and permanent forfeiture. Recovery counters come from authorized observations and recorded handoff events. Historical takeover events without recovery metadata retain their original forfeit meaning.

The terminal results view has one selector per finalist and a selector for all their formal submissions, including failed attempts. A report displays the exact submitted source, aggregate passing-test count and up to six recorded test examples with input, expected output and actual output. These are captured from the actual judging execution, not rerun or inferred. Older receipts without stored details explicitly say evidence is unavailable. Programs and judging inputs remain private before termination.

## Local review and games

From this checkout, use two terminals:

```sh
npm run dev:live:server
```

```sh
npm run dev:live:client
```

Open **http://localhost:5192/** and select **Start local exhibition** to run a complete preview game. These agents are scripted and use the real local Sandbox judge, without paid model inference. Docker must be running. The backend listens on 8807, the inspector on 9307, and data persists in `.agent-game/live-experience`. The launcher creates an isolated development authentication secret if necessary. It creates no match automatically.

Frontend edits update through Vite. Backend file watching is deliberately disabled to avoid interrupting running games; restart the backend after backend edits. Existing archive records remain in the persistence directory. `LOCAL_GAME_URL` can point the frontend to another local backend.

The live server uses normal game timing (`--time-scale 1`), including when real model-controlled external entrants join. The launcher's accelerated preview default is unsuitable for model latency. The preview provider still controls only house entrants and house coverage; it does not turn externally controlled competitors into scripted agents.

## Verification

`npx playwright test --config tests/browser/coding-live.config.ts` runs against the local frontend on 5192 using canonical protocol fixtures. It verifies retained content during delayed requests, bottom following, a paused reader, returning to live, the 128-row bound, public puzzle unlock, absence of chat, terminal submission browsing, actual-versus-expected presentation and mobile width. A long-race archive regression checks that Act I is visible on direct entry and reload, with earlier/latest navigation confined to Act I.

Real Worker/Sandbox integration separately verifies authority, public reveal gates, silent finalists, stored judging evidence and local-game startup. These are preview checks, not new real-model calibration runs.
