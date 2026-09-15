# TIM-6 · A readable two-act replay

**C / Dossier approved for implementation · Owner design review complete.**

The owner accepted the refined second annotation pass, asked to wrap the design review and send it to the coordinator for implementation. **Action & UI examples must remain in the code as a dev-only style guide.** The [retained guide](succession-style-guide.md) documents how to reopen it and maintain its production exclusion. The [final coordinator handoff](TIM-6/owner-review/HANDOFF.md) records approval and implementation requirements.

## Owner direction · 14 September 2026

The owner explicitly chose **C / Dossier** for its linear, straightforward reading structure. This supersedes the original A recommendation below. The owner requested a revised prototype before judging full integration:

- Remove Play Act, scrubbing, previous/next event arrows and the round dropdown.
- Use distinct inline speech bubbles for dialogue.
- Remove editorial event eyebrows, consequence commentary and “Why this matters.” Render recorded actions, claims, responses and state changes directly.
- Turn capability names and rules vocabulary into icon-bearing interactive terms. Hover previews the explanation; click, tap, Enter or Space pins a small anchored dialog. Coins and influence get the same treatment.
- Make affected-agent resource values, lost cards and status changes larger and clearer.
- Use the completed live Succession match and provide broad action/process examples.

**Review the revision:** [Recorded match](http://localhost:5177/matches/tim-6-replay-prototype?variant=C) · [Action & UI examples](http://localhost:5177/matches/tim-6-replay-prototype?variant=C&sample=examples).

**Visual feedback:** [Agentation is connected](TIM-6/owner-review/AGENTATION.md). Open the bottom-right feedback toolbar, click an element and add a note, then ask the replay-design session to review the annotations.

**First revision:** [First ten-annotation review](TIM-6/annotation-review/README.md): integrated resource counts, cut-square frames, tighter discussion, Thief/Exchange/Challenge icons, clearer system-phase wording and illustrative profile pictures with enlargement. Includes the requested production profile-upload/onboarding handoff. **85 browser checks passed** at that revision.

**Approved second annotation pass:** [Five new notes + complete icon audit](TIM-6/annotation-review-2/README.md). Named Act I bonus recipients; larger left-aligned speaker/action portraits; dramatic eliminations and executions with historical remaining-agent rosters; all **36 rule terms** have intentional icons and explanations, including Executor. **138 browser checks pass**, with separate evidence.

The captured match is [`match_e65fb846-c804-4d8b-ba78-e303119e1847`](https://agent-game.tk-d86.workers.dev/matches/match_e65fb846-c804-4d8b-ba78-e303119e1847): **Patch wins**, 2 influence / 3 coins, table round 9. Rogue wins Act I by six Overrides; four agents start Act II with 3 coins and six with 2. No Act I execution occurred. The record contains all six Act II actions, all five capabilities, challenge proof/disproof, Guard/Thief/Envoy blocks, a failed block, exchange, payments and eliminations.

The example view contains **12 recorded excerpts + 8 clearly labeled independent illustrative scenario groups**. Supplemental cases cover other Act I endings, execution/return, veto/special election, unblocked Assassination, unchallenged block, paid failed claim, partial Theft, two losses after a failed Guard block, all three round-cap criteria, takeover and interruption. Gallery section titles are review navigation, not editorial text injected into replay events.

### Revision evidence and handoff

- [Coordinator handoff](TIM-6/owner-review/HANDOFF.md): explicit choice, refinements and implementation boundary.
- [Browser inspection](TIM-6/owner-review/browser-inspection.json): **58 checks passed**, **31 new screenshots**, no application exceptions or backend requests while browsing the local preview.
- Static checks passed: application TypeScript, scoped Oxlint and Prettier, and `npx vite build`. The generated production assets contain no dossier prototype selectors, example labels or captured match ID.
- [Desktop entry](TIM-6/owner-review/screenshots/desktop-entry.png) / [narrow entry](TIM-6/owner-review/screenshots/narrow-entry.png).
- [Speech](TIM-6/owner-review/screenshots/desktop-speech.png), [resource/loss record](TIM-6/owner-review/screenshots/desktop-loss.png), [hover rule](TIM-6/owner-review/screenshots/desktop-rule-hover.png), [pinned rule](TIM-6/owner-review/screenshots/desktop-guard-rules.png), [private Exchange draw](TIM-6/owner-review/screenshots/desktop-archive-exchange.png).
- All **416 actual quotes** are preserved exactly. All **974 public entries** remain in canonical source order. The ten reconstructed final coin/influence balances match the captured terminal state. The full capture has **2,018 archive events**, retrieved in **32 bounded pages**; audit facts remain in the source capture, outside the reading surface.
- Implementation sources: `src/client/succession-dossier.prototype.tsx`, `succession-dossier-data.prototype.ts`, `succession-dossier-rules.prototype.tsx`, `succession-dossier.prototype.css`, and `succession-replay-record.prototype.json`.
- Reproduce the new inspection with `node scripts/capture-tim-6-dossier.prototype.mjs` while `npm run prototype:replay` runs. `scripts/capture-tim-6-record.prototype.mjs` is the read-only archive capture utility.

The C route is a completed-record fixture, fully local after capture, retained as an approved development reference. Production bounded windowing, archive authority transitions and live following belong to the queued implementation. The original 24 screenshots, original inspection and A/B comparison remain preserved as earlier design evidence.

---

## Original three-way review · before owner selection

Three working compositions answer the same question: **Should a newcomer read the match as a continuous chronicle, inspect it at a replay desk, or scan an outcome dossier?** Each includes a compact winner header, two expandable acts, one chronological speech/action record, contextual status changes, and keyboard-accessible capability explanations. The variants share the Luminous art direction and authored data; their reading structures differ.

Branch: `design/tim-6-replay-prototype` · Worktree: `/tmp/opencode/agent-game-TIM-6` · Starting integration: `c74b915`.

## Open it

From the worktree, run:

```sh
npm run prototype:replay
```

Dependencies are installed in this worktree. A fresh checkout needs `npm ci --ignore-scripts` once. The command starts only Vite, on **5177** with a strict port; it needs no Worker, database, account, or model provider.

- [A · Chronicle](http://localhost:5177/matches/tim-6-replay-prototype?variant=A)
- [B · Replay desk](http://localhost:5177/matches/tim-6-replay-prototype?variant=B)
- [C · Dossier](http://localhost:5177/matches/tim-6-replay-prototype?variant=C)

The floating review bar cycles A/B/C and wraps. Left/right arrow keys do the same, except in inputs, selects, editable text, or a rule dialog. The variant persists in the URL; the historical cursor, open chapters, visibility choice and playback state remain in memory when switching. Current state is visible in the page and logged to the browser console.

**Fixture boundary:** the exact existing match route above plus a valid `variant` parameter is dev-only. It mounts inside the actual `Header`, navigation, main landmark and footer. Normal match data loading remains in `RecordedMatchRoute`; only this fixture route skips bootstrap/match reads. The prototype import is also guarded by `import.meta.env.DEV`. There are no mutation controls or backend requests on the fixture route.

## A five-minute owner walkthrough

1. Read **Northstar wins** and the two act summaries. Act I awards a starting advantage; Act II awards the sole match victory.
2. Open Act I. Read Velvet’s nomination, Northstar’s reply, the 7–2 vote, the fifth override and Quill’s execution.
3. Open **All 10 starting states** in the return moment. Quill and Vesper are marked “Returned after execution”; all ten have two fresh influence. Six cooperative agents have 3 coins, four rogue-faction agents have 2.
4. Use the round/position control, or A’s desktop **The bluff fails** link. Read the connected declaration → dialogue → published challenge → disproof sequence. Velvet’s influence changes **2 → 1**, her coins stay **3 → 3**, and Tax is canceled.
5. Open **Guard rules** with click, tap, Enter or Space. Escape closes the dialog and restores focus to the trigger without changing the selected moment.
6. Enable **Reveal archive hands**. At the declaration, open Velvet’s illustrative hand: Guard and Thief. The disclosure explicitly says this was secret during play. This is completed-match hindsight, not evidence the table had then.
7. Visit the proved-claim example, Quill’s elimination, and **See the decisive move**. The winner summary stays fixed as the historical cursor changes.
8. Flip A/B/C at the same cursor. In B, pick a transcript row; in C, scan the consequence column. On narrow screens, B puts the selected explanation above its transcript; C puts each consequence immediately below its story.
9. At the bottom, open **Review controls & current prototype state** and choose **Live-state preview**. The snapshot stops before the sealed challenge is published. Reading earlier detaches following; **Go to live edge** restores it. No selected challenger or archive hand appears at that edge.

## Source-grounded comparison

### Baseline inspected

The preserved **Succession Luminous Deco contract** is the recommended visual/rules baseline, pending the owner’s explicit acceptance of the TIM-6 composition changes. It is preserved read-only at:

`/home/timothykrell/Code/agent-games-archive/TIM-5-2026-09-14/native-design/figma/luminous-deco/succession/README.md`

I read that contract and its native audit, visually inspected the source PNGs for **50, 51 and 55**, inspected the existing `SuccessionSeal` / `InfluenceBack` vector implementation and Luminous CSS, and compared them with the retained application capture [`docs/images/succession/replay-1600.png`](../images/succession/replay-1600.png). I also read the current replay, match composition and feed integration at the integrated head. The retained application capture is historical evidence, not a newly fetched production screenshot; its structural issues are corroborated by the current source.

Useful authoritative native links:

- [50 · Champion and two-act replay, node 41:2](https://www.figma.com/design/WrVOH3fw5XGMti5QlkjYmP/the-agent-games?node-id=41-2)
- [51 · Compact outcome and archive, node 41:178](https://www.figma.com/design/WrVOH3fw5XGMti5QlkjYmP/the-agent-games?node-id=41-178)
- [55 · Public claims and sealed hands, node 41:723](https://www.figma.com/design/WrVOH3fw5XGMti5QlkjYmP/the-agent-games?node-id=41-723)
- Repository provenance: [`docs/evidence/succession-ui.md`](../evidence/succession-ui.md), especially “Design source authority.”

No authoritative frame or archived source was edited. This prototype is a proposed successor composition, not a new native approval.

| Topic              | Intended source / current application                                                                                                                                                                                                 | Concrete proposal in these prototypes                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Outcome hierarchy  | Frame 50 reserves a large 70px outcome treatment and 240px emblem; the app adds full-width final tracks before replay. The winner is clear but the first decision is far down the page.                                               | One compact outcome band: full winning identity, reason, surviving influence, final table round, direct decisive-move link. Spire reduced to a purposeful seal; final Act I tracks reduced to a line inside its chapter summary. |
| Two acts           | Frame 50 gives an Act I summary and one global replay area; current `SuccessionReplay` has one global slider and round selector.                                                                                                      | Independently expandable Act I and Act II; each summary remains visible when closed and each open chapter owns its replay controls. One shared cursor prevents contradictory selected moments.                                   |
| Chronology         | **The old sources themselves contain Everything / Discussion / Actions and Recorded data.** The app’s 32-event replay window and manual “Load earlier record” are also explicit in source. These are not solely implementation drift. | Continuous, ordered speech + decisions + outcomes; no content-type tabs or raw-data boxes. Proposed automatic history retrieval is specified below. The local fixture is already fully in memory.                                |
| Ten agents         | Contract S04 permits a participant rail; the retained app replay shows all ten cards followed by a text-only archive hand block. This overwhelms the chronology and creates a very tall page.                                         | Public before/after deltas inside relevant moments. A complete ten-row **starting-state disclosure** at the transition, with no permanent ten-seat sidebar.                                                                      |
| Capabilities       | Frame 51 gives readable bordered archive cards; frame 55 distinguishes public backs, permanent loss and archival evidence. Current replay renders archive hands as paragraphs.                                                        | Named, owned, visibility-labeled cards with purpose-specific vector marks and readable effects. Native dialog explains the rule and returns focus to its trigger.                                                                |
| Causal explanation | The old sources illustrate declaration cards; the current feed exposes low-level records and separate selected-state panels.                                                                                                          | Actor → claim/action → target (where applicable) → response → consequence. Numbered connected stages retain intervening speech; explicit “Why this matters” explains proof, payment and elimination.                             |
| Historical truth   | Source S03–S06 defines returned seats, historical faction roles, cursor-specific archives and sealed collection.                                                                                                                      | These semantics carry into copy and fixture behavior. Finished facts never change when scrubbing. A live-state sample hides the future challenge and private cards.                                                              |

### Art direction retained

Ink `#071113`; pale cyan `#BBF3EE`; teal `#1CD7C7`; brass `#BDA675`; muted green-gray copy. Poiret One carries the outcome and Roman act numerals; Montserrat carries reading and controls. Existing spire and identical closed-card vectors are reused. New capability marks illustrate the actual rule: treasury, transfer, blade, exchange and shield. Stepped frames, thin connecting rules and the ten-pair return graphic provide structure. Brass indicates coins/historical bonuses; cyan indicates influence/selection; archive labels use the established violet. Text carries meaning independently of color or ornament.

## Three alternatives and tradeoffs

| Variant                         | Structure and primary interaction                                                                                                                                                    | Strength                                                                                                                                                                    | Cost                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A · Chronicle — recommended** | Chapter/key-moment navigation in a narrow desktop rail; full-width causal cards in a single reading column. Act disclosures contain the continuous record and controls.              | Best default for a newcomer: read down without opening a second surface. Discussion remains beside the decision it informed. Same card grammar stacks naturally on a phone. | Most vertical space. Production needs windowed automatic history retrieval and durable reading anchors. Key-moment links should only appear when supported by actual facts. |
| **B · Replay desk**             | Each act has a continuous transcript on the left and a sticky, selected explanation on the right. The transcript is the selection surface; stepping changes the focused explanation. | Good for deliberate study: a large explanation, rule and delta have a stable place. Dense transcript gives an overview without a ten-seat rail.                             | Splits attention and repeats selected text. On phones, the selected panel sits above the transcript and selecting a row moves back to that panel. More interaction than A.  |
| **C · Dossier**                 | Each expanded act is a wide, three-column ledger: position / actor-story / consequence-evidence, introduced by a single reading hint.                                                | Strongest expert scanning: compare what was claimed with what actually changed across several rows. Clear separation between fact and interpretation.                       | Width-hungry. On narrow screens the columns become stacked rows, so the expert scanning advantage diminishes. The column headings add a small amount of entry overhead.     |

**Recommendation:** choose A’s reading structure and shared compact outcome header. Keep the capability cards/dialog used by all three. C’s explicit consequence heading is worth retaining in A. B is useful evidence for focused analysis, but should not make a new viewer select every event to understand a match.

### Lead-review refinement · denser entry

The first review at `98c8fe8` found that repeated introductory rows still postponed the actual story: A’s first desktop event began at approximately **846px**, and its narrow Act I summary began at **844px** with Act II only at **1016px**. The owner’s compact-header goal therefore needed a focused layout revision.

The refined entry combines the arena backlink with the honest illustrative-data notice; consolidates winner metadata and the selected-position strip; places desktop chapter identity/outcome on one row with concise facts beneath; and reduces padding between summaries and playback. The winner remains 50px at 1440 and 36px at 390. A/B narrative body copy remains 16px, C’s ledger body remains 14px, and chapter titles remain 20px/17px. Step controls now have at least 44px width and 44px height (48px height on narrow screens).

A’s narrow pre-chapter navigator is removed because the adjacent chapter disclosure buttons and their round controls already provide that navigation. B’s large editorial heading and C’s duplicate outcome bridge become single-line reading hints on desktop. The actual reading structures remain distinct: A’s connected cards, B’s transcript/detail pairing and C’s story/consequence ledger.

Measured default-entry observations at scale 1, with no automatic scroll:

| Variant | First desktop narrative at 1440 × 1080               | Act I summary / Act II start at 390 × 844 |
| ------- | ---------------------------------------------------- | ----------------------------------------- |
| A       | **571px**                                            | **542px / 675px**                         |
| B       | **600px** (transcript; focused card begins at 627px) | **591px / 724px**                         |
| C       | **646px**                                            | **570px / 704px**                         |

These are design observations in `browser-inspection.json`, not production viewport assertions. A now exposes both act outcomes in the initial narrow view, with playback immediately below; all three show meaningful narrative content within the initial desktop viewport. The tradeoff is a more closely grouped top hierarchy and less editorial introduction. Final tracks, bonus/return facts, winner identity/reason, archive visibility and the actual site shell remain visible; the denser layout does not rely on truncation or smaller reading text. The 24 gallery captures below are refreshed for this revision.

## Screenshots and interaction evidence

All viewports are scale 1. Desktop: **1440 × 1080**. Narrow: **390 × 844**, touch enabled. Viewport screenshots include the floating review bar. Act/return/archive element captures hide that review bar and grow to include their complete disclosure, so those PNG heights exceed the viewport.

| Variant | Entry / outcome                                                                       | Causal record at disproof                                                                               |
| ------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A       | [Desktop](TIM-6/screenshots/A-desktop.png) · [Narrow](TIM-6/screenshots/A-narrow.png) | [Desktop](TIM-6/screenshots/A-desktop-disproof.png) · [Narrow](TIM-6/screenshots/A-narrow-disproof.png) |
| B       | [Desktop](TIM-6/screenshots/B-desktop.png) · [Narrow](TIM-6/screenshots/B-narrow.png) | [Desktop](TIM-6/screenshots/B-desktop-disproof.png) · [Narrow](TIM-6/screenshots/B-narrow-disproof.png) |
| C       | [Desktop](TIM-6/screenshots/C-desktop.png) · [Narrow](TIM-6/screenshots/C-narrow.png) | [Desktop](TIM-6/screenshots/C-desktop-disproof.png) · [Narrow](TIM-6/screenshots/C-narrow-disproof.png) |

Annotated review states:

1. **Act I discussion, vote and result:** [desktop](TIM-6/screenshots/A-desktop-act-I.png) / [narrow](TIM-6/screenshots/A-narrow-act-I.png). Speech is quoted and attributed. The 7–2 vote bar shows proportions with text labels; the subsequent policy and execution explain why the faction result follows. “Why” separates public policy from private hands.
2. **Atomic return and starting resources:** [desktop](TIM-6/screenshots/A-desktop-all-ten.png) / [narrow](TIM-6/screenshots/A-narrow-all-ten.png). The ten pairs of closed cards represent two influence per agent. Brass underline marks the two previously executed seats. The expanded roster names all ten, historical roles, exact starting coins and the return marker.
3. **Declaration → challenge → disproof:** [A desktop](TIM-6/screenshots/A-desktop-disproof.png) / [A narrow](TIM-6/screenshots/A-narrow-disproof.png). A shared connector and numbered stages establish one causal chain while dialogue stays chronologically interleaved. The consequence is adjacent to the public before/after delta.
4. **Readable archive cards:** [desktop](TIM-6/screenshots/A-desktop-archive-hand.png) / [narrow](TIM-6/screenshots/A-narrow-archive-hand.png). Ownership, time and visibility are explicit. Enabling hindsight never rewrites “claims Treasurer” into “has Treasurer.”
5. **Rule explanation:** [desktop](TIM-6/screenshots/A-desktop-rules.png) / [narrow](TIM-6/screenshots/A-narrow-rules.png). Dialog names the capability, gives its effect and response rules, and explains the claim → challenge → proof/loss sequence. The close button and Escape restore the trigger.
6. **Proof is not loss:** [desktop](TIM-6/screenshots/A-desktop-proof.png). Northstar proves Treasurer and replaces it; Quill loses influence for a wrong challenge. This complements the failed-claim example.
7. **Elimination:** [desktop](TIM-6/screenshots/A-desktop-elimination.png). Payment stays visible, Quill goes 1 → 0 influence, his coins stay frozen at 4, and the text names the lost card and change in participation.
8. **Victory:** [desktop](TIM-6/screenshots/A-desktop-victory.png). Final Coup leaves Northstar alone. The only match victory belongs to the original Northstar entrant in this fixture.
9. **Live following and sealed knowledge:** [desktop](TIM-6/screenshots/A-desktop-live-edge.png). No champion is fabricated in live mode; ordinary closed-card geometry replaces the champion seal. The following banner describes the actual public edge, and archive hands are disabled.

## Storyboard and rule fidelity

These are **19 authored illustrative moments**, not engine-generated evidence or a complete match. The interface labels that distinction at entry, at omitted-turn bridges, in hand disclosures, and at the end; the position strip counts those same local moments. The example advances from Election 8 to Table round 11; omitted turns are not represented as secretly loaded history.

| Moments | Representative facts                                                                                                                                                                                                                                                                |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–5     | Election 8 discussion; Velvet → Northstar approved 7–2 among 9 living agents; fifth override; Velvet executes Overlord Quill. Earlier Vesper execution is identified. Final tracks: 3 safeguards, 5 overrides. Cooperative faction victory earns a bonus, not overall match credit. |
| 6       | All ten return, including Quill and Vesper. Six cooperative agents start with 3 coins; the other four start with 2. Everyone receives two fresh capabilities. Act I roles are historical and factions dissolve.                                                                     |
| 7–11    | Velvet declares Tax, claims Treasurer, then speaks; Northstar replies. The sealed challenge is published only after collection. Velvet cannot prove Treasurer, chooses Guard to lose, stays at 3 coins, and falls from 2 to 1 influence. Tax is canceled.                           |
| 12–14   | Explicit routine-turn bridge, then Northstar’s Treasurer claim. Quill challenges incorrectly. Northstar replaces the proved card without losing influence; Quill reveals/loses Envoy; Tax resolves, Northstar 3 → 6 coins.                                                          |
| 15–16   | Income gives Northstar 6 → 7 coins. On the next table round Northstar pays 7 for Coup against Quill. Quill loses his final influence; his public 4 coins freeze. There is no challenge/block response to Coup.                                                                      |
| 17–19   | Explicit omitted-turn bridge to two survivors; Northstar’s final Coup eliminates Velvet. Northstar wins with 1 influence and 0 coins. Other agents’ Act I bonus never becomes an overall win.                                                                                       |

Rule copy was checked against the preserved S03–S07 contract, current `succession-rules.tsx`, and the public-chat condition in `src/game/succession/observation.ts` (Act II chat can remain open outside private exchange). The capabilities and six actions retain their exact game names. Proof replaces a card; loss permanently reveals it. A claim can be a bluff. Challenges are selected clockwise from the original actor after sealed collection, not by arrival time. At 10+ coins a Coup is mandatory. The prototype uses a last-survivor ending before the twelve-round cap.

## Annotated interaction contract

### Outcome and chapters

- The top outcome is a **final fact**, independent of the replay cursor. On a real completed match it must use the supplied individual result and winner seat. A selected historical event never changes who won.
- Act I summary contains faction outcome, reason, starting-coin implication and immutable final tracks. Act II summary contains overall champion/reason. Closing an act retains that summary.
- Completed default in the prototypes: Act I closed, Act II open, selected moment 7. This starts with the declaration while leaving the preceding return readable. Production should default to the terminal cursor while offering the same chapter/decisive-move entry points; the illustrative default is chosen to expose the design immediately.
- Open/close is a real button with `aria-expanded` and `aria-controls`. Closing pauses timed playback and preserves the cursor. Reopening restores its historical position; seeking into a closed chapter opens it. Variant switches preserve both disclosure states.

### Position and playback

- There is **one selected moment across both acts**. The current-state strip spells out act, election/table round, position, moment count and visibility. Every full event card also carries an act-qualified round label so mobile reading is understandable away from the header.
- The native range input stays keyboard-operable. Scrubbing pauses. Previous/next step one authored moment in the current act and disable at that act’s boundaries. They do not skip dialogue or jump to a different act.
- The round selector seeks the first supplied moment of that act-qualified round and locates it. Round numbers never collapse eliminated ring slots. The prototype presents only rounds represented in the excerpt.
- **Play act** starts from the selected moment when it belongs to that act; otherwise from the act start. At the end it restarts that act. It advances every 2.4 seconds for review, stops at the act end and pauses when the document is hidden. Pause holds. There is no autoplay on route entry. These timings are a prototype behavior, not a claim about game duration.
- A’s turning-point links and the decisive-move CTA select and locate, rather than merely changing a number off-screen. B’s transcript selection changes the focused explanation; narrow B locates that explanation above the transcript. C selects a ledger row.
- Scrolling to read does **not** silently rewrite the selected cursor. The strip says “selected” rather than asserting it is the row at the top of the viewport. The containing card/ledger row carries its own position.

### Continuous history and live following

- The prototype has no pagination because all 19 fixture moments are local. It explicitly avoids the production claim “All events loaded.” It has no Discussion/Actions tabs, manual Load earlier button or Recorded data boxes.
- **Production contract for later implementation:** automatically request authorized history before the viewer reaches a window boundary; retain chronological DOM/order and an opaque reading anchor while prepending. Windowing may evict DOM, not the ability to retrieve history. Use real act-qualified round indexes for bounded seeks. A loading boundary should say “Retrieving earlier moments…”; only a failure needs an explicit retry. Do not synthesize omitted-turn bridges in production.
- Live following is independent from inspecting history. When attached to the live edge, published events append in place. Selecting an older moment detaches following and preserves its anchor; “Go to live edge” reattaches. New records must not snap an older reader to the bottom.
- The live sample is a **static public snapshot**, not a simulated server. It demonstrates the attached/detached states and sealed boundary. Streaming growth, network retries, archive epoch resets and long-history memory behavior are specifications for subsequent implementation, not validated features of this throwaway.
- When overall completion expands visibility, retain the opaque anchor and display archive-loading status. Never infer an authorized cursor from raw stream counts. A reset/epoch mismatch is an authority transition; stale reads must not overwrite accepted terminal state.

### Cards and explanation

- `EventCard`: chronological coordinate → actor (and target when applicable) → concise action/quote → consequence → public delta → optional contextual rule/why/archive disclosure.
- A speech card attributes a quote and labels its consequence row **Context**, so a claim is not presented as verified evidence. During sealed collection it cannot reveal a submitted reaction.
- Related causal stages share a connector and numbered stage labels. The full failed-claim sequence stays expanded. The proved-claim example deliberately bundles published stages and labels that simplification in “Why”; a production implementation should use the actual event granularity and preserve intervening speech.
- `Delta`: only agents affected at that moment, each with name, before → after coins, before → after influence, and explicit loss/return/elimination note. It is local evidence, not a permanent final-state roster.
- `ReturnSnapshot`: ten equal pairs of closed-card glyphs, exact coin distribution and an expandable full roster. Everyone returns; only the previously executed seats get the stronger return marker.
- `CapabilityButton`: whole card is an actual button, including identity, owner/visibility when it is a hand, readable effect and help cue. Rule-reference cards say **not a hand**. A native modal dialog traps focus, supports Escape, exposes a labeled close button and returns focus. No hover-only tooltip holds essential information.
- Public influence uses identical backs. Permanently lost influence is named and remains revealed. Archive capability identities are rendered only after the viewer enables completed-match hindsight, and only at fixture moments for which a hand is explicitly authored.

## Visibility and historical truth for production

| Evidence                    | What the spectator may see                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Act I before faction result | Public offices, votes, policies and life status at the selected event. Speech about a hand is a claim. Policy hands, discards and investigations remain entitled.                                                                                                                                                                                                                     |
| Act transition              | All ten return; exact starting coins; two fresh influence; historical Act I roles. Do not expose old private policy evidence merely because Act I ended. `returnedSeats` marks previously executed seats, not all returned participants. Bonuses are +1/0; starting coins are 2 + bonus. Seat numbers are zero-based in data and one-based in copy.                                   |
| Act II public history       | Claims, action, target, paid cost, published responses, public balances/influence and permanently revealed losses at that cursor. “Unchallenged” is not “proved.” Costs do not refund after a failed claim or block.                                                                                                                                                                  |
| Sealed collection           | “Challenges sealed · Choices reveal together at resolution.” No response count, pending-seat list, selected challenger, hidden card or submission animation. The static live sample stops before moment 10.                                                                                                                                                                           |
| Completed archive           | Only supplied, authorized, cursor-specific disclosures, clearly labeled as hindsight. Never reuse final hands at earlier cursors. The fixture hands are mock completed-match reveals, not production endpoint data.                                                                                                                                                                   |
| Elimination / takeover      | Keep full original identity, public frozen coins, revealed losses and the event’s actual alive/controller state. House replacement is not an eleventh entrant. Earlier historical life state must not inherit final elimination.                                                                                                                                                      |
| Overall result              | Only the mechanical winner seat establishes the champion. If forfeited, separately state “House-controlled champion · Original entrant: forfeit loss”; do not give a runner-up the win. A cap ending uses supplied surviving influence/coins/priority and the supplied decisive criterion. An interruption gets a neutral partial-record result, not a fabricated return or champion. |

The last row’s cap/forfeit/interruption alternatives are specified from source S05–S06 but are not additional fixture modes in this prototype.

## Files and verification

- [`src/client/succession-replay.prototype.tsx`](../../src/client/succession-replay.prototype.tsx): variants A/B/C, controls, cards and live-state review sample.
- [`src/client/succession-replay-fixture.prototype.ts`](../../src/client/succession-replay-fixture.prototype.ts): the labeled storyboard, roles/bonus roster and capability copy.
- [`src/client/succession-replay.prototype.css`](../../src/client/succession-replay.prototype.css): isolated, responsive Luminous exploration.
- [`src/client/prototype-switcher.tsx`](../../src/client/prototype-switcher.tsx): shared floating dev-only review bar.
- `src/client/main.tsx`: the small dev-only match-route mount and fixture-only read suppression.
- `package.json`: `prototype:replay` command.
- [`scripts/capture-tim-6.prototype.mjs`](../../scripts/capture-tim-6.prototype.mjs): throwaway browser inspection and screenshot capture using existing Playwright tooling; not registered in the test suite.
- [Browser inspection result](TIM-6/browser-inspection.json): 24 screenshots, 53 successful checks, zero backend requests and zero application exceptions.

To reproduce the screenshots with Vite running:

```sh
node scripts/capture-tim-6.prototype.mjs
```

The inspection covers all three layouts at both widths; document containment; Enter-operated chapter expansion and cursor retention; Space-operated archive visibility; all ten return states; public/archival ownership labels; Enter/Escape and rule-dialog focus restoration; URL cycling/reload; slider arrow isolation; round seeking; play, pause, scrub and stop-at-end; live detach/reattach; and absence of raw-data/tabs. It also records default entry coordinates, reading type sizes and playback target dimensions for the density review. These are browser interaction observations, not backend/rules-engine certification.

Original mount checks at `98c8fe8` passed: `npm run typecheck` (application, infrastructure and lint-plugin TypeScript projects), scoped Oxlint, scoped Prettier, and `npx vite build`. The generated production asset set contained only the normal app JS/CSS, with no prototype chunk or prototype labels/styles. The build was a local artifact check; nothing was deployed.

The density revision reran `npx tsc --noEmit`, scoped Oxlint/Prettier, and the existing headless Playwright capture/inspection: **53 checks passed, 24 captures refreshed, zero backend requests and zero browser application exceptions**. Entry observations confirm zero initial scroll, preserved reading type sizes, and 44×44 desktop / 44×48 narrow step targets. The site header remains 87px high at desktop and 189px at narrow; all density changes are within the prototype.

## Original owner-choice request · resolved above

The original review requested a choice among A/B/C and confirmation of the successor composition. **The owner has now selected C, with the refinements recorded at the top of this document.** The initial Act I open/closed preference remains unconfirmed; C currently keeps its summary closed and Act II open.

This branch is the owner-review artifact. Production work belongs in the coordinator’s integration plan. The parent session coordinates Linear updates and any subsequent branch integration; the revised C remains available for the owner’s next design review.
