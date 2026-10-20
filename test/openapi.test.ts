// The CLI and the published API reference stay together: the operation table
// is the generator's output for openapi/customer-v1.json, every operation is
// reached by a command or by `bladecp api`, and every command named in the
// coverage map exists and calls its operation.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { COVERAGE } from '../src/api/coverage.js';
import { OPERATIONS, type OperationId } from '../src/api/operations.js';
import { COMMANDS } from '../src/args.js';

const root = new URL('..', import.meta.url).pathname;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(join(dir, entry.name))
      : entry.name.endsWith('.ts')
        ? [join(dir, entry.name)]
        : [],
  );
}

// The published document and its generator stay in the private repository
// (the document carries example IDs the public release gate refuses); the
// public tree checks the coverage only.
const hasSpec = existsSync(join(root, 'openapi/customer-v1.json'));

describe.skipIf(!hasSpec)('the operation table', () => {
  it('is the generated output of openapi/customer-v1.json (run "node scripts/sync-openapi.mjs")', async () => {
    // @ts-expect-error: a plain JavaScript script without types.
    const { generate } = await import('../scripts/sync-openapi.mjs');
    const spec = readFileSync(join(root, 'openapi/customer-v1.json'), 'utf8');
    const current = readFileSync(join(root, 'src/api/operations.ts'), 'utf8');
    expect(generate(spec)).toBe(current);
  });

  it('has every operation of the document, once', () => {
    const spec = JSON.parse(readFileSync(join(root, 'openapi/customer-v1.json'), 'utf8'));
    const ids: string[] = [];
    for (const item of Object.values(spec.paths) as Record<string, { operationId?: string }>[]) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        const id = item[method]?.operationId;
        if (id) ids.push(id);
      }
    }
    expect(Object.keys(OPERATIONS).sort()).toEqual(ids.sort());
  });
});

describe('coverage of the API', () => {
  const ids = Object.keys(OPERATIONS) as OperationId[];

  it('places every operation (a command, or bladecp api with a reason)', () => {
    expect(Object.keys(COVERAGE).sort()).toEqual([...ids].sort());
  });

  it('names only commands that exist', () => {
    const commands = new Set(COMMANDS.map((spec) => spec.id));
    const missing = ids.filter((id) => {
      const coverage = COVERAGE[id];
      return 'command' in coverage && !commands.has(coverage.command);
    });
    expect(missing, 'operations whose command does not exist yet').toEqual([]);
  });

  it('calls every operation that has a command from the code of the CLI', () => {
    const sources = walk(join(root, 'src'))
      .filter((path) => !/src\/api\/(operations|coverage)\.ts$/.test(relative(root, path)))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    const uncalled = ids.filter((id) => 'command' in COVERAGE[id] && !sources.includes(`'${id}'`));
    expect(uncalled, 'operations no command calls yet').toEqual([]);
  });

  it('keeps commands for what people run and bladecp api for the rest', () => {
    const withCommand = ids.filter((id) => 'command' in COVERAGE[id]).length;
    // More than two thirds of the API has a command of its own.
    expect(withCommand / ids.length).toBeGreaterThan(2 / 3);
  });
});
