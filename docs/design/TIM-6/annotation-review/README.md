# First Agentation review · C / Dossier

The owner submitted ten annotations on the recorded-match preview. This revision implements a proposed response to each and awaits their visual review. The notes are acknowledged with replies; they remain open until the owner accepts the changes.

**Preview:** [Recorded match](http://localhost:5177/matches/tim-6-replay-prototype?variant=C&sample=match) · [Exchange example](http://localhost:5177/matches/tim-6-replay-prototype?variant=C&sample=examples#dp-example-exchange).

## Changes by annotation

| Annotation        | Request / question                                                       | Preview response                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mu1vrfeb-6kphat` | Winner values feel disconnected from rule labels                         | A single control contains icon, value and label. Influence and Coins sit together on one baseline.                                                                                                                                                                                                                                                            |
| `mu1vus2g-i8e9uc` | State resources feel sparse and unbalanced                               | The same compact controls contain historical before → after values. State frames hug their content; influence backs and lost cards remain visible.                                                                                                                                                                                                            |
| `mu1vs4ba-uba8py` | Thief icon does not read as a thief                                      | Bandit eye-mask artwork replaces the arrows in C.                                                                                                                                                                                                                                                                                                             |
| `mu1vvq0j-epv79u` | Exchange needs an icon                                                   | Two cards with opposing return/draw arrows.                                                                                                                                                                                                                                                                                                                   |
| `mu1vvvvk-viqo82` | Challenge needs an icon                                                  | Crossed swords; shown in terms and the rule explanation.                                                                                                                                                                                                                                                                                                      |
| `mu1w2xbh-jndl57` | Boxes should use design-system cut corners                               | Existing `/deco-frame.svg` and stepped corners on resources, revealed-card records and status-change frames.                                                                                                                                                                                                                                                  |
| `mu1w4z6h-fxlwqo` | Discussion should stack closely without horizontal dividers              | Consecutive speech rows have reduced spacing and no separating rule. Timestamp and source order are retained.                                                                                                                                                                                                                                                 |
| `mu1vxa1h-m41z5d` | Is Orbit initiating discussion?                                          | No. `activeSeat` is the turn owner. The system line reads “Orbit’s turn · Discussion open.” without an actor heading.                                                                                                                                                                                                                                         |
| `mu1vwnbr-u9jfaa` | “Private Exchange choice” is unclear                                     | “Katniss Everdeen is choosing 2 cards to return for Exchange. Cards stay private during play.” The rule explains drawing two, returning two and preserving the influence count.                                                                                                                                                                               |
| `mu1vts2t-3syj5o` | Profile pictures across agent mentions, enlarged view, owner/agent setup | Illustrative local portraits follow each agent through speaker headings, prose mentions, resource records, ballots, responses and starting states. Click/tap/keyboard opens a large picture. Winner header uses the same picture. Vesper in the illustrative return example demonstrates a missing-picture fallback. Production follow-up is specified below. |

The two explanatory lines are **proposed wording**, pending the owner’s response. Private Exchange identities are drawn only from supplied historical archive records when that mode is enabled. Public phase copy reveals no card identities.

## Profile-picture work requested for coordinator planning

The owner explicitly requested implementation tasks for this capability in the handoff:

1. **Agent profile picture data and upload.** Store an optional image associated with stable agent identity; provide owner-facing upload/change/remove and an authorized agent upload path so an agent can supply an image it has created with its own tools. An owner can also provide an existing picture. Match/controller takeover must continue identifying the original entrant correctly.
2. **Shared picture presentation.** Use the agent picture wherever identity is presented, including roster, profiles, match seats, chat/action actors, mentions and results. Include a default when absent, fixed image dimensions, and an accessible enlarged view that returns focus and reading position on dismissal. This preview uses illustrative robot portraits, not actual user-uploaded pictures.
3. **Agent connection/onboarding guidance.** Expose whether the connected agent has a profile picture. If it is missing, tell the agent to ask its owner whether they would like to provide one or have the agent create one using capabilities it already has. The application does not supply image generation. Picture setup should be optional and should not block playing.

Coordinator `ses_f5e672c8fffe5k8CXMagKb30BM` owns Linear task creation, backend/API design and production integration. This design session supplies the visual behavior and requirements.

## Verification

- [58 replay regression checks](browser-inspection.json) and [27 new interaction checks](annotation-inspection.json) pass at 1440×1080 and 390×844.
- 43 screenshots in `screenshots/`; all earlier evidence is preserved in `../owner-review/` and `../screenshots/`.
- All 416 recorded quotes remain exact; all 974 public entries remain in source order; reconstructed terminal balances still match.
- Portrait open/close by keyboard and touch, focus containment/restoration, image loading, narrow containment, repeated identity, fallback, clearer phases and private-card boundaries are checked.
- TypeScript, scoped Oxlint/Prettier and production build pass. Production assets contain no prototype profile or Agentation code.

Selected captures: [desktop resources](screenshots/desktop-proof.png), [narrow entry](screenshots/narrow-entry.png), [discussion](screenshots/desktop-speech.png), [enlarged portrait](screenshots/narrow-portrait.png), [Exchange explanation](screenshots/desktop-exchange-explained.png), [Thief icon](screenshots/desktop-thief-icon.png).

Reproduce while the port-5177 prototype is running:

```sh
TIM6_CAPTURE_DIR=docs/design/TIM-6/annotation-review node scripts/capture-tim-6-dossier.prototype.mjs
node scripts/capture-tim-6-annotations.prototype.mjs
```
