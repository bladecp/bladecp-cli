// Shapes returned by the BladeCP Customer API (`/api/v1/customer/*`).
// Unknown fields are kept untouched and passed through in `--json` output.

export interface MeData {
  customer_uuid: string;
  customer_email: string;
  api_key_uuid: string;
  scopes: string[];
  tier: string;
  rate_limit: { tier: string; limit_per_minute: number | null };
}

export interface Provision {
  uuid: string;
  status: string;
  /** Documented name; some API versions send `primaryDomain` instead. */
  primary_domain?: string | null;
  product_type?: string | null;
  [key: string]: unknown;
}

type UsageMetrics = Record<string, number | null>;

export interface UsageData {
  provisionUuid: string;
  plan: UsageMetrics | null;
  usage: UsageMetrics | null;
  pct?: UsageMetrics | null;
  status?: string;
  asOf?: string | null;
  [key: string]: unknown;
}

export interface DestinationLocation {
  locationId: number;
  name: string;
  countryCode?: string | null;
  city?: string | null;
  region?: string | null;
}

export interface DestinationPrice {
  currency: string;
  /** Monthly catalog price in currency units (not cents). */
  priceMonthly: number;
}

export interface Destination {
  partnerUuid: string;
  partnerName: string;
  partnerPlanId: number;
  planName: string;
  diskGb?: number | null;
  prices?: DestinationPrice[];
  locations: DestinationLocation[];
}

export type MigrationPhase =
  | 'draft'
  | 'uploading'
  | 'queued'
  | 'parsing'
  | 'discovery_review'
  | 'provisioning'
  | 'importing'
  | 'validating'
  | 'awaiting_approval'
  | 'syncing'
  | 'cutover_pending'
  | 'live'
  | 'failed'
  | 'cancelled'
  | 'cutover_stalled';

export interface MigrationComponent {
  name: string;
  status: string;
  message?: string;
  completedAt?: string | number | null;
}

export interface MigrationRetry {
  allowed: boolean;
  reason: string | null;
  migrationUuid: string | null;
  published: boolean;
}

export interface MigrationTiming {
  executionMs: number;
  waitingMs: number;
  state: string;
  phaseEnteredAt: string | null;
}

export interface Migration {
  uuid: string;
  phase: MigrationPhase | string;
  primaryDomain: string | null;
  requestedPrimaryDomain?: string | null;
  sourcePrimaryDomain?: string | null;
  /** What the reading of the backup found (counts of files, email accounts, ...). */
  discovery?: {
    emailAccountCount?: number;
    emailHistoryBytes?: number;
    [key: string]: unknown;
  } | null;
  components?: MigrationComponent[] | null;
  stagingUrl?: string | null;
  /** Public IPv4 for an A record of the domain, once the migration is complete. */
  cutoverTarget?: string | null;
  /** True once the backup object is fully stored (public projection). */
  backupReady?: boolean;
  message?: string | null;
  reason?: string | null;
  retry?: MigrationRetry;
  timing?: MigrationTiming | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface CreatedMigration {
  migrationUuid: string;
  phase: string;
}

export interface UploadPartUrl {
  partNumber: number;
  url: string;
}

export interface UploadedPart {
  partNumber: number;
  etag: string;
  sizeBytes?: number;
}

export interface UploadUrlResponse {
  uploadId: string;
  partSize: number;
  partCount?: number;
  parts: UploadPartUrl[];
  uploadedParts?: UploadedPart[];
  expiresIn?: number;
}

export interface CompleteUploadResponse {
  phase: string;
  sizeBytes: number | null;
}

export interface PhaseResponse {
  phase: string;
}

export interface RetryResponse {
  migrationUuid: string;
  phase: string;
}

export interface ConnectTokenResponse {
  /** Name of the organization, when the API starts sending it. */
  organization?: { name?: string | null } | null;
  apiKey: string;
  keyUuid: string;
  scopes: string[];
  expiresAt: string | null;
  migrationUuid?: string | null;
  customer: { uuid: string; email: string; name?: string | null };
}
