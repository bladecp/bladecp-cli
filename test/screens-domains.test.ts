// Photos of the `bladecp domains` screens (see test/helpers/screens.ts).
//
//   pnpm vitest run test/screens-domains.test.ts -u

process.env.TZ = 'UTC';

import { domainsState, seedDomains } from './helpers/mock/domains.js';
import { type Env, type Scenario, SERVER, screenSuite } from './helpers/screens.js';

const withDomains = ({ api }: Env) =>
  seedDomains(api, SERVER, ['blog.example.com', 'loja.example.com.br']);

const SCENARIOS: Scenario[] = [
  { name: 'help domains', argv: () => ['domains', '--help'], signedOut: true },
  { name: 'help domains add', argv: () => ['domains', 'add', '--help'], signedOut: true },
  { name: 'domains list', argv: () => ['domains', 'list', '0197a1c4'], setup: withDomains },
  { name: 'domains list main only', argv: () => ['domains', 'list', '0197a1c4'] },
  { name: 'domains add', argv: () => ['domains', 'add', '0197a1c4', 'blog.example.com'] },
  { name: 'domains add in use', argv: () => ['domains', 'add', '0197a1c4', 'shop.example.org'] },
  {
    name: 'domains remove question',
    argv: () => ['domains', 'remove', '0197a1c4', 'blog.example.com'],
    setup: withDomains,
    options: () => ({ answers: [''] }),
  },
  {
    name: 'domains remove',
    argv: () => ['domains', 'remove', '0197a1c4', 'blog.example.com'],
    setup: withDomains,
    options: () => ({ answers: ['y'] }),
  },
  { name: 'domains check free', argv: () => ['domains', 'check', 'new.example.com'] },
  { name: 'domains check taken', argv: () => ['domains', 'check', 'shop.example.org'] },
  {
    name: 'domains check other account',
    argv: () => ['domains', 'check', 'www.example.info'],
    setup: ({ api }) => {
      domainsState(api).otherZones.add('example.info');
    },
  },
  { name: 'domains bad host', argv: () => ['domains', 'check', 'localhost'] },
];

screenSuite(SCENARIOS);
