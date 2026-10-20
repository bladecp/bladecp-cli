// How the CLI reaches each Customer API operation: a command of its own, or
// the generic `bladecp api`. Every operation of src/api/operations.ts must be
// here (`pnpm typecheck` fails otherwise), so a new route of the API is never
// forgotten; test/openapi.test.ts checks that each command exists and calls
// its operation.

import type { OperationId } from './operations.js';
import type { Coverage } from './types.js';

const MACHINE = { api: 'machine' } as const;

export const COVERAGE: Record<OperationId, Coverage> = {
  // Account
  getMe: { command: 'whoami' },
  postConnectToken: { command: 'login' },
  getHealth: { api: 'probe' },

  // Servers
  getProvisions: { command: 'servers.list' },
  getProvisionsByUuid: { command: 'servers.show' },
  getProvisionsByUuidUsage: { command: 'servers.show' },

  // Self-service migrations
  'getMeMigration-destinations': { command: 'destinations.list' },
  postMeMigrations: { command: 'migrate' },
  'postMeMigrationsByUuidUpload-url': { command: 'migrate' },
  'postMeMigrationsByUuidComplete-upload': { command: 'migrate' },
  'postMeMigrationsByUuidConfirm-upload': { command: 'migrate' },
  getMeMigrations: { command: 'migrations.list' },
  getMeMigrationsByUuid: { command: 'migrations.status' },
  'postMeMigrationsByUuidDiscovery-review': { command: 'migrations.review' },
  postMeMigrationsByUuidApprove: { command: 'migrations.approve' },
  postMeMigrationsByUuidCancel: { command: 'migrations.cancel' },
  postMeMigrationsByUuidRetry: { command: 'migrations.retry' },

  // Domains
  getProvisionsByUuidDomains: { command: 'domains.list' },
  postProvisionsByUuidDomains: { command: 'domains.add' },
  deleteProvisionsByUuidDomainsByHost: { command: 'domains.remove' },
  getProvisionsDomainsAvailability: { command: 'domains.check' },

  // Apps
  getAppsCatalog: { command: 'apps.list' },
  getAppsBySlug: { command: 'apps.show' },
  postProvisionsByUuidAppsInstall: { command: 'apps.install' },

  // WordPress Toolkit
  getProvisionsByUuidWordpress: { command: 'wordpress.status' },
  postProvisionsByUuidWordpressDashboard: { command: 'wordpress.dashboard' },
  postProvisionsByUuidWordpressCoreUpdate: { command: 'wordpress.update.core' },
  postProvisionsByUuidWordpressPluginsBySlugUpdate: { command: 'wordpress.update.plugin' },
  postProvisionsByUuidWordpressThemesBySlugUpdate: { command: 'wordpress.update.theme' },
  getProvisionsByUuidWordpressCommandsById: { command: 'wordpress.task' },

  // Components
  getComponentsCatalog: { command: 'components.list' },

  // Partner catalog
  getPartnerPlans: { command: 'partner.plans' },
  getPartnerLocations: { command: 'partner.locations' },
  'getPartnerOption-groups': { command: 'partner.options' },
  'getPartnerPlansByPlanUuidOption-groups': { command: 'partner.options' },
  getBrandingAssets: { command: 'partner.branding' },

  // Partner: customers' servers
  postProvisionsSimple: { command: 'partner.servers.create' },
  postProvisions: { api: 'advanced' },
  patchProvisionsByUuid: { command: 'partner.servers.plan' },
  patchProvisionsByUuidOptions: { command: 'partner.servers.options' },
  deleteProvisionsByUuid: { command: 'partner.servers.delete' },
  postProvisionsByUuidCancel: { command: 'partner.servers.cancel' },
  postProvisionsByUuidSuspend: { command: 'partner.servers.suspend' },
  postProvisionsByUuidUnsuspend: { command: 'partner.servers.unsuspend' },
  'postProvisionsByUuidSso-link': { command: 'partner.servers.open' },

  // Partner: Vibe accounts
  'getVibeAccountsBy-external-serviceByExternalServiceId': { command: 'partner.vibe.find' },
  postVibeAccounts: { command: 'partner.vibe.create' },
  getVibeAccountsByAccountId: { command: 'partner.vibe.show' },
  patchVibeAccountsByAccountId: { command: 'partner.vibe.plan' },
  deleteVibeAccountsByAccountId: { command: 'partner.vibe.terminate' },
  postVibeAccountsByAccountIdSuspend: { command: 'partner.vibe.suspend' },
  postVibeAccountsByAccountIdReactivate: { command: 'partner.vibe.reactivate' },
  'postVibeAccountsByAccountIdReactivate-serving': { command: 'partner.vibe.resume' },
  postVibeAccountsByAccountIdSso: { command: 'partner.vibe.open' },

  // Partner: Vibe flows between the WHMCS module and BladeCP
  'getVibeCommercial-readiness': MACHINE,
  'postVibeIdentity-link-intents': MACHINE,
  'postVibeIdentity-link-intentsByIntentIdExchange': MACHINE,
  'postVibeCommercial-catalogsSync': MACHINE,
  'postVibeCommercial-action-ticketsRedeem': MACHINE,
  'postVibeContext-recoveryRedeem': MACHINE,
  'postVibeContext-recoveryConfirm': MACHINE,
  postVibeSupportWhmcsStart: MACHINE,
  postVibeSupportWhmcsAuthorize: MACHINE,
  postVibeSupportIntents: MACHINE,
  getVibeFederationInstallationsByInstallationIdCapabilities: MACHINE,
  postVibeFederationStart: MACHINE,
  postVibeFederationIntents: MACHINE,
  postVibeFederationIntentsByIntentIdAuthenticate: MACHINE,
  postVibeFederationSso: MACHINE,
  postVibeFederationLogout: MACHINE,

  // Partner: marketplace
  getMarketplaceSummary: { command: 'partner.marketplace.summary' },
  getMarketplaceOrders: { command: 'partner.marketplace.orders' },
  'getMarketplaceCommission-lines': { command: 'partner.marketplace.commissions' },
  getMarketplaceStatements: { command: 'partner.marketplace.statements' },
  getMarketplaceStatementsById: { command: 'partner.marketplace.statement' },
  'getMarketplaceSubstrate-invoices': { command: 'partner.marketplace.invoices' },

  // Partner: webhooks
  'getWebhook-endpoints': { command: 'partner.webhooks.list' },
  'getWebhook-endpointsById': { command: 'partner.webhooks.show' },
  'postWebhook-endpoints': { command: 'partner.webhooks.create' },
  'patchWebhook-endpointsById': { command: 'partner.webhooks.update' },
  'deleteWebhook-endpointsById': { command: 'partner.webhooks.delete' },
  'postWebhook-endpointsByIdRotate-secret': { command: 'partner.webhooks.rotate-secret' },
  'getWebhook-deliveries': { command: 'partner.webhooks.deliveries' },
  'postWebhook-deliveriesByIdReplay': { command: 'partner.webhooks.replay' },

  // Partner: Fast Deploy migrations
  getMigrations: { command: 'partner.migrations.list' },
  getMigrationsByRequestUuid: { command: 'partner.migrations.show' },
  postMigrationsByRequestUuidApprove: { command: 'partner.migrations.approve' },
  postMigrationsByRequestUuidCancel: { command: 'partner.migrations.cancel' },
  postMigrationsByRequestUuidRetry: { command: 'partner.migrations.retry' },
  'postMigrationsByRequestUuidDiscovery-review': { command: 'partner.migrations.review' },
  'getMigrationsBilling-queue': { command: 'partner.migrations.billing-queue' },
  'postMigrationsByRequestUuidBilling-link': { command: 'partner.migrations.billing-link' },
  'postMigrationsByRequestUuidClaim-url': { command: 'partner.migrations.claim-url' },
  postMigrations: MACHINE,
  'postMigrationsByRequestUuidUpload-url': MACHINE,
  'postMigrationsByRequestUuidComplete-upload': MACHINE,
  'postMigrationsByRequestUuidConfirm-upload': MACHINE,
  postMigrationsByRequestUuidService: MACHINE,
  'postMigrationsByRequestUuidBilling-linkClaim-required': MACHINE,
  postMigrationsClaimsVerify: MACHINE,
  postMigrationsByRequestUuidCommercial: MACHINE,
};
