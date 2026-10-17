import { chmodSync, readFileSync } from 'node:fs';

const bin = new URL('../dist/bin.js', import.meta.url);
if (!readFileSync(bin, 'utf8').startsWith('#!/usr/bin/env node')) {
  console.error('dist/bin.js lost its shebang');
  process.exit(1);
}
chmodSync(bin, 0o755);
