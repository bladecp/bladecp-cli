// The message catalogs of the command groups, merged into en.ts, pt-BR.ts and
// es.ts. A key belongs to one catalog only (test/i18n.test.ts checks it).
import * as api from './api.js';
import * as apps from './apps.js';
import * as components from './components.js';
import * as domains from './domains.js';
import * as partner from './partner.js';
import * as partnerMarketplace from './partner-marketplace.js';
import * as partnerMigrations from './partner-migrations.js';
import * as partnerServers from './partner-servers.js';
import * as partnerVibe from './partner-vibe.js';
import * as partnerWebhooks from './partner-webhooks.js';
import * as wordpress from './wordpress.js';

export const GROUP_CATALOGS = {
  api,
  domains,
  apps,
  wordpress,
  components,
  partner,
  partnerServers,
  partnerVibe,
  partnerMarketplace,
  partnerWebhooks,
  partnerMigrations,
};
