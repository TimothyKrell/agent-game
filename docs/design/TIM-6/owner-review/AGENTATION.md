# Annotating the replay prototypes

Agentation is connected to replay-design OpenCode session `ses_f5de5681cffe63Ph3X91bHK573`.

## Use it

1. Open [C / Dossier](http://localhost:5177/matches/tim-6-replay-prototype?variant=C) or the [action/UI examples](http://localhost:5177/matches/tim-6-replay-prototype?variant=C&sample=examples) in a desktop browser.
2. Click the small **Agentation button in the bottom-right corner** (tooltip: “Start feedback mode”).
3. Click an element, write the feedback, and click **Add**. The note syncs to the annotation server automatically.
4. Tell the replay-design session **“review my annotations.”** The session can read the note, selector, page URL and React component context; acknowledge it; reply; and resolve accepted changes. Ask for **“watch annotations”** to have the session wait for new feedback while you annotate.

The toolbar is also mounted on A and B. Use Escape or the toolbar’s close control to return to ordinary page interaction.

## Local wiring

- Pinned dev dependencies: `agentation@3.0.2`, `agentation-mcp@1.2.0`.
- `src/client/succession-replay.prototype.tsx` mounts a DEV-only lazy Agentation component beside the replay layout, with `endpoint="http://localhost:4747"`.
- Project `opencode.json` connects MCP using:

  ```sh
  node node_modules/agentation-mcp/dist/cli.js server --mcp-only --http-url http://localhost:4747
  ```

- Port **4747** is the existing shared annotation HTTP server from the setup session. This worktree’s MCP process connects to that server instead of opening another listener.
- `opencode2 mcp list` reports `agentation connected`; its nine tools are available to this session.
- The Vite production build contains no Agentation code, endpoint or prototype chunk.

## Verified browser → MCP → browser

On 14 September 2026, an isolated Chromium session visited the actual C URL and used the visible toolbar to add a clearly labeled connection-check note to **“Patch wins.”**

| Evidence                                     | Result                                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Annotation session                           | `mu1vsc5y-cucbqu`                                                                            |
| Test annotation                              | `mu1vsd32-7jdn86`                                                                            |
| Selector received through this session’s MCP | `.rp-outcome > .rp-outcome-identity > div > h1`                                              |
| React context                                | `App → MatchRoute → SuccessionReplayPrototype → SuccessionDossierPrototype → DossierContent` |
| Browser submission                           | HTTP 201, one annotation marker                                                              |
| MCP operations                               | Read pending, acknowledge, reply, resolve                                                    |
| Same browser state after reload              | Resolved status and reply thread loaded; zero annotation markers                             |
| Browser errors                               | None                                                                                         |

The test note requested no design change and is resolved. [Submitted annotation capture](agentation-pending.png) · [Resolved browser capture](agentation-resolved.png).

Application TypeScript, scoped Oxlint/Prettier, production build and all **58 existing dossier browser checks** passed with Agentation mounted. The new validation captures were written to `/tmp/opencode/tim-6-agentation-dossier-check/`; earlier design evidence remains in this directory. The inspection script now accepts `TIM6_CAPTURE_DIR` and scopes its no-playback assertion to the replay layout, since Agentation has its own settings controls.
