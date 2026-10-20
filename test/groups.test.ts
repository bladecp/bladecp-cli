// The command groups of src/commands/specs/ fit together: each command has
// its code, options and message keys belong to one group, topics have
// commands, and partner commands live under `bladecp partner`.

import { describe, expect, it } from 'vitest';

import { COMMANDS, GROUP_DEFAULTS, isGroup, OPTIONS, resolveCommand, TOPICS } from '../src/args.js';
import { HANDLERS } from '../src/commands/handlers.js';
import * as api from '../src/commands/specs/api.js';
import * as apps from '../src/commands/specs/apps.js';
import * as components from '../src/commands/specs/components.js';
import * as domains from '../src/commands/specs/domains.js';
import { GROUPS } from '../src/commands/specs/index.js';
import * as partner from '../src/commands/specs/partner.js';
import * as partnerMarketplace from '../src/commands/specs/partner-marketplace.js';
import * as partnerMigrations from '../src/commands/specs/partner-migrations.js';
import * as partnerServers from '../src/commands/specs/partner-servers.js';
import * as partnerVibe from '../src/commands/specs/partner-vibe.js';
import * as partnerWebhooks from '../src/commands/specs/partner-webhooks.js';
import * as wordpress from '../src/commands/specs/wordpress.js';
import { en } from '../src/i18n/en.js';
import { GROUP_CATALOGS } from '../src/i18n/groups/index.js';

const SPEC_FILES = {
  api,
  apps,
  components,
  domains,
  partner,
  partnerMarketplace,
  partnerMigrations,
  partnerServers,
  partnerVibe,
  partnerWebhooks,
  wordpress,
};

const groupCommands = GROUPS.flatMap((group) => group.commands);

describe('command groups', () => {
  it('every group command has its code, and every handler its command', () => {
    const ids = groupCommands.map((spec) => spec.id);
    expect(
      ids.filter((id) => !HANDLERS[id]),
      'commands without code',
    ).toEqual([]);
    expect(
      Object.keys(HANDLERS).filter((id) => !ids.includes(id)),
      'code without a command',
    ).toEqual([]);
  });

  it('command IDs and command words are unique', () => {
    const ids = COMMANDS.map((spec) => spec.id);
    expect(new Set(ids).size).toBe(ids.length);
    const words = COMMANDS.map((spec) => spec.path.join(' '));
    expect(new Set(words).size).toBe(words.length);
  });

  it('every command resolves to itself and its usage starts with its words', () => {
    for (const spec of COMMANDS) {
      const args = spec.args.map((_, i) => `arg${i}`);
      const resolved = resolveCommand([...spec.path, ...args]);
      expect(resolved.kind === 'command' && resolved.spec.id, spec.id).toBe(spec.id);
      expect(spec.usage.startsWith(`bladecp ${spec.path.join(' ')}`), spec.id).toBe(true);
    }
  });

  it('a group adds options under names no other group uses', () => {
    const seen = new Map<string, string>();
    for (const [file, module] of Object.entries(SPEC_FILES)) {
      for (const name of Object.keys(module.options)) {
        expect(seen.get(name), `--${name} in ${file} and ${seen.get(name)}`).toBeUndefined();
        seen.set(name, file);
      }
    }
    for (const name of seen.keys()) expect(OPTIONS, name).toHaveProperty(name);
  });

  it('a message key belongs to one catalog only', () => {
    const owners = new Map<string, string>();
    for (const [name, catalog] of Object.entries(GROUP_CATALOGS)) {
      for (const key of Object.keys(catalog.en)) {
        expect(owners.get(key), `${key} in ${name} and ${owners.get(key)}`).toBeUndefined();
        owners.set(key, name);
      }
    }
    // The base catalog keeps its keys apart from the groups.
    const base = Object.keys(en).filter((key) => !owners.has(key));
    for (const key of owners.keys()) expect(base).not.toContain(key);
  });

  it('every topic is a group with commands, and every default runs a command', () => {
    for (const topic of TOPICS) expect(isGroup(topic.path), topic.path.join(' ')).toBe(true);
    for (const [group, id] of Object.entries(GROUP_DEFAULTS)) {
      expect(
        COMMANDS.some((spec) => spec.id === id),
        `${group} -> ${id}`,
      ).toBe(true);
    }
  });

  it('partner commands live under "bladecp partner" and say so', () => {
    for (const spec of COMMANDS) {
      const under = spec.path[0] === 'partner';
      expect(Boolean(spec.partner), spec.id).toBe(under);
      if (under) expect(spec.group, spec.id).toBe('partner');
    }
  });
});
