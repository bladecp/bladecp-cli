// Every command group added after the first versions, in the order the help
// lists them. Each file of this folder holds only data (commands, options,
// topics and help), so the help and the reference never load command code.
import type { GroupSpec } from '../../args.js';
import { group as apiGroup, options as apiOptions } from './api.js';
import { group as appsGroup, options as appsOptions } from './apps.js';
import { group as componentsGroup, options as componentsOptions } from './components.js';
import { group as domainsGroup, options as domainsOptions } from './domains.js';
import { group as partnerGroup, options as partnerOptions } from './partner.js';
import {
  group as partnerMarketplaceGroup,
  options as partnerMarketplaceOptions,
} from './partner-marketplace.js';
import {
  group as partnerMigrationsGroup,
  options as partnerMigrationsOptions,
} from './partner-migrations.js';
import {
  group as partnerServersGroup,
  options as partnerServersOptions,
} from './partner-servers.js';
import { group as partnerVibeGroup, options as partnerVibeOptions } from './partner-vibe.js';
import {
  group as partnerWebhooksGroup,
  options as partnerWebhooksOptions,
} from './partner-webhooks.js';
import { group as wordpressGroup, options as wordpressOptions } from './wordpress.js';

export const GROUP_OPTIONS = {
  ...apiOptions,
  ...domainsOptions,
  ...appsOptions,
  ...wordpressOptions,
  ...componentsOptions,
  ...partnerOptions,
  ...partnerServersOptions,
  ...partnerVibeOptions,
  ...partnerMarketplaceOptions,
  ...partnerWebhooksOptions,
  ...partnerMigrationsOptions,
};

export const GROUPS: GroupSpec[] = [
  apiGroup,
  domainsGroup,
  appsGroup,
  wordpressGroup,
  componentsGroup,
  partnerGroup,
  partnerServersGroup,
  partnerVibeGroup,
  partnerMarketplaceGroup,
  partnerWebhooksGroup,
  partnerMigrationsGroup,
];
