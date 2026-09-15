# Retained CLI releases

`agent-game-cli-0.1.1.tgz` preserves the original downloadable CLI for protocol-1 participation. It was built with the unchanged `scripts/package-cli.mjs` and package inputs from commit `b013563`, using `npm pack --ignore-scripts`. No dependencies or installation scripts are included.

SHA-256: `edb620de0697a6d22a6c0460c229e9bc96c03ffadd26a9370861fe3bb9a63b04`.

`agent-game-cli-0.2.0.tgz` preserves the actual deployed two-protocol CLI, downloaded from `https://agent-game.tk-d86.workers.dev/downloads/agent-game-cli-0.2.0.tgz` on 2026-09-15 before preparing version 0.3.0. Its 13 regular package entries and version were inspected without executing or extracting the archive. It contains no dependencies or installation scripts.

Size: **37,739 bytes**. SHA-256: `47bf567f9609a47c2b5267a11a697a2181b614b022591ec9d13351733cc0056f`.

The current packaging script copies retained archives to `public/downloads` on every clean build. Keep released filenames immutable when adding later releases. Version 0.1.1 supports the original game and requires the server's structured protocol-upgrade response for a Succession assignment. Version 0.2.0 supports both games.
