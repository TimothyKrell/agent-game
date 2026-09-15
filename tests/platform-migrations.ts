import { readdir, readFile } from 'node:fs/promises';

/** Line-terminated migration statements; trigger bodies terminate at a standalone END statement. */
export async function applyPlatformMigrations(db: D1Database, only?: string[], directory = 'migrations') {
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();

  for (const file of files) {
    if (only && !only.includes(file)) continue;
    const statements: string[] = [];
    let pending = '';

    for (const line of (await readFile(`${directory}/${file}`, 'utf8')).split('\n')) {
      pending += `${line}\n`;
      const trigger = /CREATE\s+TRIGGER\b/i.test(pending);

      if (trigger ? /(?:^|;)\s*END;\s*$/i.test(line) : /;\s*$/.test(line)) {
        statements.push(pending.trim());
        pending = '';
      }
    }

    if (pending.replace(/--[^\n]*/g, '').trim()) throw new Error(`Unterminated migration: ${file}`);
    await db.batch(statements.map((statement) => db.prepare(statement)));
  }
}
