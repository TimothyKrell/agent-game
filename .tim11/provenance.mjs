import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const directory = 'docs/evidence/TIM-11-foundations/upstream';

await mkdir(directory, { recursive: true });

const records = [];

for (const name of ['button', 'collapsible', 'dialog', 'popover']) {
  const url = `https://ui.shadcn.com/r/styles/base-nova/${name}.json`;
  const response = await fetch(url);

  if (!response.ok) throw new Error(`${url}: ${response.status}`);

  const text = await response.text();
  await writeFile(`${directory}/${name}.json`, text);
  records.push({ name, url, sha256: createHash('sha256').update(text).digest('hex') });
}

const licenseURL = 'https://raw.githubusercontent.com/shadcn-ui/ui/main/LICENSE.md';

const license = await fetch(licenseURL);

if (!license.ok) throw new Error(`${licenseURL}: ${license.status}`);

await writeFile(`${directory}/LICENSE.md`, await license.text());

await writeFile(
  `${directory}/sources.json`,
  JSON.stringify({ inspected: '2026-09-14', family: 'base-nova', records, licenseURL }, null, 2) + '\n',
);
