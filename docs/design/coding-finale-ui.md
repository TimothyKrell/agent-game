# Coding Finale frontend

Status: protocol-v3 live Act I, finale, bounded Dossier history and terminal replay are integrated and browser-verified for TIM-49. The browser is a public spectator; authenticated agents use the production challenge/practice/submission tools. The fixture browser remains a development-only review surface.

## Ownership boundary

- `src/client/coding-finale-*` owns presentation, responsive layout, local countdown calibration, and translation into display labels.
- `src/shared/coding-finale.ts`, game registration, match authority, protected challenge/source APIs, and action transport are owned outside TIM-49.
- `CodingFinaleView` is a deliberately narrow presentation model, not a second wire contract. `codingFinaleView()` is the privacy-filtering adapter from canonical `Observation3`.
- Fixture routes never call match APIs and remain development-only. They are review surfaces, not a claim that production is wired.

## States and disclosure

| Authority state | Primary display                                                            | Clock                                      | Private workspace                                     |
| --------------- | -------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------- |
| Act 1           | Full board, phase, government, policy tracks, seats and bounded Dossier    | Act 1 authority only                       | Agent authority only                                  |
| `preparing`     | Qualified survivor handoff and runner preparation                          | Hidden until authority supplies a deadline | Agent-authorized resource                             |
| `racing`        | Shared deadline, finalist progress, receipt-order activity                 | Server-calibrated countdown                | Agent-authorized resource; owner browser is spectator |
| `judging`       | “Finishing accepted submissions” and pending receipts                      | Zero, never a winner signal                | Read-only while accepted work drains                  |
| `finished`      | Champion and explicit Tier 2 / Tier 1 fallback / committed-priority reason | Closed                                     | Source archive control only when authority allows it  |
| `interrupted`   | Recovery-safe interruption                                                 | Stopped                                    | No inferred winner                                    |

Tier 2 challenge content is absent—not visually hidden—until the viewing finalist’s own Tier 1 pass unlocks it. Spectators receive no challenge workspace, submission source, or source archive control before termination. Public finalist progress is rendered only from authority-provided fields.

## Layout

1. Compact match coordinate, phase chip, and authoritative race clock.
2. Act 1 handoff using the Dossier’s stepped panels and readable survivor/elimination distinction. There are no Succession coins, influence, returns, or bonuses.
3. Finale split: finalist table and receipt-ordered activity on the left; public chat on the right. The private challenge workspace is implemented as a presentation component but is not requested by owner-browser sessions.
4. Terminal outcome is a separate gold panel. A provisional pass remains visually and semantically separate from a final result.

Desktop portraits are 88px; the shared token reduces them to 64px below 760px. At narrow widths the split becomes one reading column, status metadata wraps, and controls retain visible focus rings.

## Timing and ordering

`serverNow` calibrates the client once per observation: `deadline - (serverNow + elapsedLocalTime)`. Reconnect replaces the calibration from the new observation; it does not restart five minutes. Reaching zero changes only the clock label. The authority must enter `judging` or `finished`.

Activity is displayed in server receipt order. Pending earlier Tier 2 work is called out when it can still displace a later passing receipt. Judge completion order is never presented as rank.

## Fixture review route

In Vite development, open `/matches/tim-49-coding-finale?fixture=racing`. Other fixture names are listed in the review navigation. The route and fixture data are excluded from production by the same lazy development guard used by the retained Dossier prototype.

## Production integration status

Implemented:

1. The existing match route decodes canonical protocol 3 and renders Coding Finale without changing historical protocol 1/2 routing.
2. `codingFinaleView()` explicitly maps authority fields and removes challenge data for spectators.
3. Current observation refresh, protocol-3 WebSocket updates, action receipts, authorization-epoch fencing, canonical bounded history parsing, public chat display, and terminal source retrieval use the backend-defined routes.
4. Owner sessions remain public spectators unless the observation contains actual `you` authority.

5. Full Act I uses the shared Dossier reader with Coding Finale-specific qualification and rule help. It does not render Succession's return, bonus or individual-result mechanics.
6. Earlier/later/latest and round navigation load authorized checkpoint/replay baselines and at most 128 events. Window changes clear incompatible rows before rendering; epoch resets discard stale history and retry against current authority.
7. Coding Finale is the default launch offering, while explicit historical game routes remain available.

## Integration verification

The root frontend passed full typecheck/lint and 27 focused UI/API/Dossier cases. Browser validation against the real local Worker included:

- Completed real-agent archive `match_791bc102-ea0c-452c-a6ea-ace77e7b2e39`: bounded paging, round navigation, terminal winning-source retrieval, and 390px mobile layout without horizontal overflow.
- Scripted preview `match_8049e43e-b6b6-46ba-8b34-e90469ecb5dd`: visible live Act I board, automatic transition through the finale to a Tier 2 champion, offline/reconnect, two observed authorization epochs, earlier-page navigation, and cold reload without browser errors.

These browser checks used preview inference and did not add paid model calls. They complement the separately documented real-model evaluation; they are not real-model calibration evidence.
