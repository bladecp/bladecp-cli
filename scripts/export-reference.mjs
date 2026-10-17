// Writes reference.json: the machine-readable reference of the CLI (commands,
// options, aliases, exit codes and stable error codes, with the texts of the
// three catalogs), built from the compiled sources in dist/ by
// src/reference.ts. Run it with `pnpm run export:reference`, which builds
// first. The BladeCP Developers site copies the file with `pnpm run cli:sync`.
//
//   node scripts/export-reference.mjs           write reference.json
//   node scripts/export-reference.mjs --check   exit 1 when it is out of date
import { readFileSync, writeFileSync } from 'node:fs';

const target = new URL('../reference.json', import.meta.url);
const check = process.argv.includes('--check');

let module;
try {
  module = await import('../dist/reference.js');
} catch (error) {
  console.error(
    `Could not load dist/reference.js (${error instanceof Error ? error.message : error}). Run "pnpm run build" first.`,
  );
  process.exit(2);
}

const next = module.formatReference(module.buildReference());
let current = '';
try {
  current = readFileSync(target, 'utf8');
} catch {
  // first export
}

const { version, commands, errors } = JSON.parse(next);
const summary = `${version}, ${commands.length} commands, ${errors.length} error codes`;
if (next === current) {
  console.log(`reference.json is up to date (${summary})`);
} else if (check) {
  console.error(`reference.json is out of date (${summary}). Run "pnpm run export:reference".`);
  process.exit(1);
} else {
  writeFileSync(target, next);
  console.log(`reference.json updated (${summary})`);
}
