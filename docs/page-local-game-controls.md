# Page-local game controls

Base: released `8d23de2d63e36bc92d2f60047460bd2fbfc86181`. No global game preference, root game provider, or implicit link rewriting remains in the intended interface.

Design authority: `/tmp/opencode/luminous-page-local-game-controls/design-contract.md`, SHA-256 `2033276f68c4b5eddbc0d6a1489de86f97c64db298217edda2b60b46a2271b4f`. Rules use manual activation: arrows/Home/End move focus; Enter/Space selects. Native fields use the labels Standings, Matches, Stats for, and Play. The stable rules heading and tablist remain outside the selected guide.

## Ownership and URL contract

| Owner                                          | Query key                             | Default             | Affected content and explicit links                                                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arena match browser                            | `gameId` (legacy home links retained) | Secret Overlord     | Live/recent browser, its queue/admission state and preview-exhibition payload only; selected match links use authoritative match ID.                                                                  |
| Arena contenders                               | `standingsGame`                       | Secret Overlord     | Contender rating preview; Full leaderboard and agent-stat links explicitly carry this pool.                                                                                                           |
| Arena archive                                  | none                                  | Both games          | Latest three actual records, deduplicated by match ID and ordered by completion/creation time; per-card game labels. Loading/partial errors disclose unavailable game records. No rating aggregation. |
| Leaderboard                                    | `gameId`                              | Secret Overlord     | Standings, rating explanation/methodology, explicit agent-stat links. Native labeled dropdown.                                                                                                        |
| Rules                                          | `gameId`                              | Secret Overlord     | One stable in-content tablist and panel; game-specific guide, documents and explicit connect-prompt link.                                                                                             |
| Public agent / owner roster                    | `gameId`                              | Secret Overlord     | Pool-specific statistics/history; relevant owner/agent/leaderboard links retain this pool deliberately.                                                                                               |
| Account roster statistics                      | `gameId`                              | Secret Overlord     | Statistics only. Account identity, drafts, installation approvals, selected competitor and authoritative participation remain mounted and independent.                                                |
| Onboarding prompt on `/connect`                | `gameId`                              | Secret Overlord     | Generated prompt only; supports deliberate rules/game-card connect links.                                                                                                                             |
| Onboarding prompt within roster                | `playGame`                            | Secret Overlord     | Generated prompt only; independent of the co-located statistics choice. No web queue-admission control is added.                                                                                      |
| Match / replay                                 | none                                  | Server response     | Actual match game and protocol are authoritative. Query choices never change a match.                                                                                                                 |
| Shared header / brand / footer / account links | none                                  | Stable destinations | Exact authored URLs; last local choice never follows the user through general navigation.                                                                                                             |

Missing keys use the documented local default. Unsupported values present a local unknown-game choice/recovery rather than retargeting shared navigation. Inline changes update only their own key, preserving other keys, pairing code and hash. Reselecting the current canonical URL is a no-op. Changes retain scroll/focus and emit `app:navigate`; real route links retain route scrolling. Popstate restores the local selections, and existing same-path motion suppression prevents entrance replay.

## Resource and action rules

Every returned resource field (data/error/status/fault) belongs to the current path visit on every render, before effects run. Initial, polling, retry and action-refresh completions must match both visit identity and latest request sequence, including A–B–A. Same-scope refresh failures may retain correctly labeled prior data.

Roster account/participation loading is independent of the statistics request. A pool change must never replace the account subtree, clear a draft, lose a focused form node, close details or reset pairing approval. Participation labels come from the server's participation game, not the selected standings pool. No server, engine, protocol, CLI or budget changes are intended.

## Baseline

Actual released rendered captures: `/tmp/opencode/local-game-controls-before-8d23de2`, four widths × Arena/leaderboard/rules/onboarding. The served JS/CSS bytes match the released build. The first meaningful navigation regression fails on the released build: a Succession standings deep link rewrites the shared brand destination to `/?gameId=succession` instead of `/`. Failure trace: `/tmp/opencode/local-game-controls-navigation-red`.
