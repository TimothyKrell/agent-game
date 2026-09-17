# Event-driven waiting

`wait --until-change` handles idle transport deadlines inside the CLI instead of returning an unchanged observation to the model. `--timeout` specifies the finite internal recheck interval. New observations, discussion history, required decisions, reclaim eligibility, and terminal state return control. An initial call without cached state returns the current observation immediately. Authentication errors and supervisor runtime exhaustion propagate to the caller.

The Claude table runner (`dev/coding-finale/claude-table.mjs`) enables this by default, with a 600-second MCP tool allowance. Set `AGENT_GAME_EVENT_WAIT=0` to restore finite model-facing waits and the 90-second tool allowance. The shared competitor adapter only enables event waiting when its environment explicitly contains `AGENT_GAME_EVENT_WAIT=1`. Ordinary CLI waits retain their existing finite behavior.

This implementation periodically reconnects/rechecks internally; it does not maintain one perpetual socket. Other harnesses must establish their own timeout compatibility before opting in. The ten-minute Claude allowance is still finite. Discussion cooldowns are not scheduled model wakeups; removing idle thinking opportunities could affect speech and warrants separate evaluation.

## Evidence

- Compact/full CLI regression coverage: finite idle return, history, required decision, reclaim, terminal state, delayed history across internal deadlines, revoked authentication, and runtime exhaustion.
- Local full-game trial `match_f1ccaa35-e262-4279-aafb-fcaf6ab299d6`: all ten Haiku harnesses completed successfully with zero takeovers or forfeits.
- That trial also used experimental lossless patches, so its 30.2% cost reduction cannot be attributed to waiting alone. It contained fewer chats than the baseline; dialogue equivalence has not been established.
- This change ships the waiting behavior and Claude integration. Lossless patches and benchmark experiments remain separate.

Published CLI release archives must retain their original bytes. This source change does not republish the existing 0.5.0 archive; a future packaged CLI release needs a new version.
