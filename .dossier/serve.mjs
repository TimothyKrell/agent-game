import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Verification-only composition with an incoming first-party RuleHelp correction.
// Normal development requires no override; this never changes the application config or source.
const ruleHelp = process.env.DOSSIER_RULE_HELP_SOURCE;

const port = Number(process.env.DOSSIER_PORT ?? 6291);

const server = await createServer({
  cacheDir: '/tmp/opencode/dossier-vite-cache',
  server: { host: '127.0.0.1', port, strictPort: true },
  optimizeDeps: { entries: ['index.html', '.dossier/browser.html'] },
  plugins: ruleHelp
    ? [
        {
          name: 'dossier-incoming-rule-help',
          enforce: 'pre',
          load: async (id) =>
            id === resolve('src/client/ui/rule-help.tsx') ? readFile(ruleHelp, 'utf8') : undefined,
        },
      ]
    : [],
});

await server.listen();

console.log(`Dossier verification on ${port}${ruleHelp ? ` · incoming RuleHelp: ${ruleHelp}` : ''}`);
