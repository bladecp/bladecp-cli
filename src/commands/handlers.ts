// The code of every command group of src/commands/specs/, by command ID.
import { handlers as api } from './api.js';
import { handlers as apps } from './apps.js';
import type { Handler } from './common.js';
import { handlers as components } from './components.js';
import { handlers as domains } from './domains.js';
import { handlers as partner } from './partner.js';
import { handlers as partnerMarketplace } from './partner-marketplace.js';
import { handlers as partnerMigrations } from './partner-migrations.js';
import { handlers as partnerServers } from './partner-servers.js';
import { handlers as partnerVibe } from './partner-vibe.js';
import { handlers as partnerWebhooks } from './partner-webhooks.js';
import { handlers as wordpress } from './wordpress.js';

export const HANDLERS: Record<string, Handler> = {
  ...api,
  ...domains,
  ...apps,
  ...wordpress,
  ...components,
  ...partner,
  ...partnerServers,
  ...partnerVibe,
  ...partnerMarketplace,
  ...partnerWebhooks,
  ...partnerMigrations,
};
