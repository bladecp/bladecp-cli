// What a migration to BladeCP brings, in one place. The analyzer shows what a
// backup holds and sorts every item by this list (comes to BladeCP, or stays
// behind), not by the state of the engine code on a given day. Change a line
// here and the CLI, the JSON report and the site follow.
//
// What the parser itself refuses (an invalid or truncated archive, an active
// WordPress Multisite, a backup without WordPress, the limits) is not decided
// here: those stay refusals or warnings in the report.

export interface Capabilities {
  /** The day this list was decided. */
  decidedOn: string;
  /** Sites of the account that move, by role. */
  sites: { primary: boolean; addon: boolean; subdomain: boolean; parkedAliases: boolean };
  /** The files of the account (the document roots of every site). */
  files: boolean;
  /** Database engines that move; every database of these engines comes along. */
  databaseEngines: readonly ('mysql' | 'mariadb')[];
  /** The PHP version of each site is kept, when it is one of `phpVersions`. */
  phpPerSite: boolean;
  phpVersions: readonly string[];
  /** Mailboxes and their messages, served over IMAP and POP3, with MX kept. */
  email: { mailboxes: boolean; access: readonly string[]; mxPreserved: boolean };
  /** The DNS zone, every record. */
  dnsZone: boolean;
  /** Cron jobs, with the same schedule. */
  cron: boolean;
  /** What stays behind, and why (a stable code). */
  staysBehind: {
    sslCertificates: 'reissued_on_pointing';
    panelPassword: 'login_by_email';
    ftpAccounts: 'new_access';
    postgresql: 'engine_not_offered';
  };
}

export const CAPABILITIES: Capabilities = {
  decidedOn: '2026-10-17',
  sites: { primary: true, addon: true, subdomain: true, parkedAliases: true },
  files: true,
  databaseEngines: ['mysql', 'mariadb'],
  phpPerSite: true,
  // The versions the migration maps from cPanel (ea-php74 to ea-php83).
  phpVersions: ['7.4', '8.0', '8.1', '8.2', '8.3'],
  email: { mailboxes: true, access: ['imap', 'pop3'], mxPreserved: true },
  dnsZone: true,
  cron: true,
  staysBehind: {
    sslCertificates: 'reissued_on_pointing',
    panelPassword: 'login_by_email',
    ftpAccounts: 'new_access',
    postgresql: 'engine_not_offered',
  },
};
