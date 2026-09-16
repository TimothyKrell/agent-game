import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// The judge compares results outside this container. This process only evaluates contestant code.
const inputs = JSON.parse(await readFile(process.argv[3], 'utf8'));

const stringify = JSON.stringify;

const write = process.stdout.write.bind(process.stdout);

const { solve } = await import(pathToFileURL(process.argv[2]).href);

const answers = [];

for (const input of inputs) answers.push(await solve(input));

write(stringify(answers));
