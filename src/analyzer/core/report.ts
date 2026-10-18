// The analysis report: the `bladecp.analyze.v1` contract shared by the CLI
// (`--json`) and the site. Fields only grow; machine codes are stable and the
// sentences for people are added by whoever shows the report, in its
// language. The types have no field for a password, a hash, a key or an email
// address, so a secret found in the backup has no way out.

export const REPORT_SCHEMA = 'bladecp.analyze.v1';

/** Every code of `blockers` (the refusals of the parser, then the gates of the import). */
export const BLOCKER_CODES = [
  'archive_invalid',
  'archive_truncated',
  'parse_cap_exceeded',
  'unrecognized_layout',
  'not_wordpress',
  'multisite_unsupported',
  'no_primary_domain',
  'invalid_primary_domain',
  'invalid_database_name',
  'invalid_table_prefix',
  'invalid_db_charset',
  'invalid_db_collation',
  'invalid_email_local_part',
  'backup_too_large',
  'multisite_disabled',
  'no_sql_dump',
  'plain_tar',
  'dot_slash_root',
  'archive_root_mismatch',
] as const;

/** Every code of `warnings`. */
export const WARNING_CODES = [
  'php_version_not_mapped',
  'table_prefix_unreadable',
  'db_name_mismatch',
  'primary_docroot_not_public_html',
  'unsafe_entry_names',
  'entries_outside_account_root',
  'multi_account_archive',
  'mailbox_history_over_cap',
  'work_volume_tight',
] as const;

export type Verdict = 'supported' | 'supported_with_warnings' | 'blocked';
export type ItemStatus = 'supported' | 'supported_with_warnings' | 'blocked' | 'not_migrated';

export interface Finding {
  code: string;
  /** Narrows the code (a machine token), when there is more to say. */
  reason?: string;
  /** Safe values for the message: a domain, a constant name, a count. */
  params?: Record<string, string | number>;
}

export interface SiteItem {
  kind: 'site';
  id: string;
  role: 'primary' | 'addon' | 'subdomain';
  app: 'wordpress' | 'other';
  wordpressVersion: string | null;
  /** Folder of the site, relative to the home of the account. */
  docroot: string | null;
  bytes: number | null;
  files: number | null;
  aliases: string[];
  status: ItemStatus;
  notes: string[];
}

export interface PhpItem {
  kind: 'php';
  id: string;
  /** "8.2", or null when the site follows the server default. */
  version: string | null;
  /** The cPanel label (ea-php82), as found. */
  label: string | null;
  status: ItemStatus;
  notes: string[];
}

export interface DatabaseItem {
  kind: 'database';
  id: string;
  engine: 'mysql' | 'mariadb';
  version: string | null;
  bytes: number;
  /** The database of the main WordPress site. */
  selected: boolean;
  status: ItemStatus;
  notes: string[];
}

export interface EmailItem {
  kind: 'email_domain';
  id: string;
  accounts: number;
  maildirBytes: number;
  status: ItemStatus;
  notes: string[];
}

export interface DnsItem {
  kind: 'dns_zone';
  id: string;
  records: Record<string, number>;
  total: number;
  status: ItemStatus;
  notes: string[];
}

export interface CountItem {
  kind: 'cron' | 'ssl' | 'ftp' | 'postgresql' | 'panel_password';
  count: number;
  status: ItemStatus;
  notes: string[];
}

export type ReportItem = SiteItem | PhpItem | DatabaseItem | EmailItem | DnsItem | CountItem;

export interface EngineDiscovery {
  phpVersion: string;
  databaseEngine: string;
  databaseVersion: string;
  fileCount: number;
  fileBytes: number;
  emailAccountCount: number;
  emailHistoryBytes: number;
  networkDomains?: string[];
}

export interface EngineSpecView {
  primaryDomain: string;
  files: { docRootPath: string; totalBytes: number; fileCount: number };
  database: { name: string; dumpPath: string; dumpBytes: number; engine: string; version: string };
  webConfig: { phpVersion: string };
  wordpress: {
    tablePrefix: string;
    legacyUrl: string;
    dbCharset: string;
    dbCollate: string;
    multisite: boolean;
  };
  email: {
    domains: { domain: string; accounts: number; maildirBytes: number; skipHistory: number }[];
  };
  network: {
    subdomainInstall: boolean;
    domain: string;
    path: string;
    sites: {
      blogId: string;
      domain: string;
      path: string;
      public: number;
      archived: number;
      spam: number;
      deleted: number;
      wwwAlias: boolean;
      previewSlug: string;
    }[];
  } | null;
}

export type EngineResult =
  | { ok: true; discovery: EngineDiscovery; spec: EngineSpecView }
  | { ok: false; code: string; reason: string | null };

export interface Requirements {
  /** Disk for the files and the mailboxes, in GB (10^9 bytes), with 25% to spare. */
  diskGb: number;
  /** Room for the databases once imported, in GB (twice the dumps). */
  databaseGb: number;
  databases: number;
  databaseEngine: 'mysql' | 'mariadb' | null;
  sites: number;
  emailAccounts: number;
}

export interface PlanChoice {
  partnerPlanId: number;
  planName: string;
  partnerName: string;
  diskGb: number | null;
  price: { currency: string; priceMonthly: number } | null;
  locations: { locationId: number; name: string; countryCode: string | null }[];
}

export type Recommendation =
  | { mode: 'offline' }
  | { mode: 'signed_out' }
  | { mode: 'unavailable'; reason?: string }
  | {
      mode: 'live';
      currency: string;
      best: PlanChoice | null;
      alternatives: PlanChoice[];
      /** Plans that may fit but do not say their disk. */
      unknownDisk: PlanChoice[];
    };

export interface Report {
  schema: typeof REPORT_SCHEMA;
  rules: { parserRevision: string; readOn: string; capabilities: string };
  file: {
    name: string;
    bytes: number;
    compression: 'gzip' | 'none';
    uncompressedBytes: number;
    entries: number;
    /** False when the reading stopped at an error (the counts are partial). */
    complete: boolean;
  };
  account: { panel: 'cpanel'; user: string; primaryDomain: string | null } | null;
  verdict: Verdict;
  blockers: Finding[];
  warnings: Finding[];
  summary: {
    sites: number;
    wordpressSites: number;
    databases: number;
    emailDomains: number;
    emailAccounts: number;
    dnsZones: number;
    dnsRecords: number;
    cronJobs: number;
    homeFiles: number;
    homeBytes: number;
    mailBytes: number;
  } | null;
  items: ReportItem[];
  engine: EngineResult;
  requirements: Requirements | null;
  recommendation: Recommendation;
  privacy: {
    /** Nothing from the backup is ever sent; true only when plans were fetched with --prices. */
    network: boolean;
    /** Kinds of secrets found in the backup (never their values). */
    sensitive: ('database_credentials' | 'password_hashes' | 'private_keys')[];
  };
}
