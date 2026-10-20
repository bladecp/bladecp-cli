// Routes of the simulated API added by each command group. Each file keeps
// its own data and answers only its own paths.
import type { MockApi } from '../mock-api.js';
import { install as apiRoutes } from './api.js';
import { install as appsRoutes } from './apps.js';
import { install as componentsRoutes } from './components.js';
import { install as domainsRoutes } from './domains.js';
import { install as partnerRoutes } from './partner.js';
import { install as partnerMarketplaceRoutes } from './partner-marketplace.js';
import { install as partnerMigrationsRoutes } from './partner-migrations.js';
import { install as partnerServersRoutes } from './partner-servers.js';
import { install as partnerVibeRoutes } from './partner-vibe.js';
import { install as partnerWebhooksRoutes } from './partner-webhooks.js';
import { install as wordpressRoutes } from './wordpress.js';

export function installGroupRoutes(api: MockApi): void {
  apiRoutes(api);
  domainsRoutes(api);
  appsRoutes(api);
  wordpressRoutes(api);
  componentsRoutes(api);
  partnerRoutes(api);
  partnerServersRoutes(api);
  partnerVibeRoutes(api);
  partnerMarketplaceRoutes(api);
  partnerWebhooksRoutes(api);
  partnerMigrationsRoutes(api);
}
