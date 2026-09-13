# Retained CLI release

`agent-game-cli-0.1.1.tgz` preserves the original downloadable CLI for protocol-1 participation. It was built with the unchanged `scripts/package-cli.mjs` and package inputs from commit `b013563`, using `npm pack --ignore-scripts`. No dependencies or installation scripts are included.

SHA-256: `edb620de0697a6d22a6c0460c229e9bc96c03ffadd26a9370861fe3bb9a63b04`.

The current packaging script copies retained archives to `public/downloads` on every clean build. Keep released filenames immutable when adding later releases. An old binary encountering a Succession assignment requires the server's structured protocol-upgrade response; this archive supports the original game.
