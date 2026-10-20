<p align="center">
  <picture>
    <source media="(max-width: 600px)" srcset="https://raw.githubusercontent.com/bladecp/bladecp-cli/main/assets/hero-compact.en.svg">
    <img src="https://raw.githubusercontent.com/bladecp/bladecp-cli/main/assets/hero.en.svg" alt="BladeCP CLI. Official command line: BladeCP in your terminal. Sign in, list your servers and migrate cPanel backups, with browser sign-in, resumable migration and stable JSON output for scripts and AI agents." width="100%">
  </picture>
</p>

<p align="center">
  <strong>Sign in, list your servers and migrate cPanel backups to BladeCP from the terminal.</strong><br>
  The official open-source command line for the BladeCP Customer API, made for people, scripts and AI agents.
</p>

<p align="center">
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/version-0.3.2-4f46e5?style=flat-square&amp;labelColor=1e1b4b" alt="Version 0.3.2"></a>
  <a href="https://www.npmjs.com/package/@bladecp/cli"><img src="https://img.shields.io/badge/npm-%40bladecp%2Fcli-6366f1?style=flat-square&amp;labelColor=1e1b4b&amp;logo=npm&amp;logoColor=white" alt="npm package @bladecp/cli"></a>
  <a href="#installation"><img src="https://img.shields.io/badge/Node.js-20%2B-4f46e5?style=flat-square&amp;labelColor=1e1b4b&amp;logo=nodedotjs&amp;logoColor=white" alt="Node.js 20 or newer"></a>
  <a href="#first-steps"><img src="https://img.shields.io/badge/languages-EN%20%C2%B7%20PT--BR%20%C2%B7%20ES-7c3aed?style=flat-square&amp;labelColor=1e1b4b" alt="English, Portuguese (Brazil) and Spanish"></a><br>
  <a href="#quality"><img src="https://img.shields.io/badge/tests-1148%20passing-8b5cf6?style=flat-square&amp;labelColor=1e1b4b" alt="1148 automated tests passing on version 0.3.2"></a>
  <a href="#quality"><img src="https://img.shields.io/badge/runtime%20dependencies-0-6d28d9?style=flat-square&amp;labelColor=1e1b4b" alt="No runtime dependencies"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-4338ca?style=flat-square&amp;labelColor=1e1b4b" alt="MIT license"></a>
  <a href="https://github.com/bladecp/bladecp-cli/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/bladecp/bladecp-cli/ci.yml?branch=main&amp;style=flat-square&amp;labelColor=1e1b4b&amp;label=public%20CI" alt="Public CI status"></a>
</p>

<p align="center">
  <code>npm install -g @bladecp/cli</code>
  <br>
  <a href="https://www.npmjs.com/package/@bladecp/cli"><strong>Install from npm</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/bladecp/bladecp-cli/releases/tag/v0.3.2">Release notes</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/bladecp/bladecp-cli/releases/download/v0.3.2/SHA256SUMS">SHA-256 checksum</a>
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#first-steps">First steps</a> ·
  <a href="#automation">Automation</a> ·
  <a href="#documentation">Documentation</a> ·
  <a href="#security">Security</a> ·
  <a href="#support">Support</a>
  <br>
  <sub><a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.es.md">Español</a></sub>
</p>

> [!NOTE]
> **Version `0.4.0`.** The CLI now reaches the whole Customer API: domains,
> apps, WordPress and components of your servers, `bladecp api` for any route,
> and the partner tools (catalog, customers' servers, Vibe accounts,
> marketplace, webhooks and Fast Deploy migrations). Exit codes, the `--json`
> envelope and error codes are a public contract: this release only adds to
> them.

The BladeCP CLI is the official terminal client of the BladeCP Customer API. It
signs you in through the browser, lists your servers and the destinations
available for migrations, and moves a site to BladeCP from a full cPanel
backup: it uploads the backup in parts, follows the migration and stops at the
preview for your approval.

It also reaches the rest of the Customer API: the domains, apps, WordPress and
components of your servers, any route through `bladecp api`, and, with a
partner key, the tools BladeCP partners use to run their customers' services.

Before you migrate, `bladecp analyze` reads the backup on your computer and
shows what it holds, what comes to BladeCP, what stays behind and the smallest
plan it needs. Nothing is sent.

It is one npm package with no runtime dependencies. On a terminal it asks only
what it cannot find out by itself. In scripts, CI and AI agents it never asks
and answers in JSON.

<a id="features"></a>

## Built for the terminal

| Browser sign-in | Resumable migration | Ready for automation |
| --- | --- | --- |
| `bladecp login` opens the Hub, you authorize once and the key is saved readable only by you. A key from the Hub or `BLADECP_API_KEY` works too. | The backup goes up in parts, three at a time, with retries. If it stops, run the same command again: only the missing parts are sent. | `--json` prints exactly one document, exit codes are stable and the CLI never asks a question without a terminal. |

### Commands

| Command | What it does |
| --- | --- |
| `bladecp login [--token <key>] [--no-browser]` | Sign in |
| `bladecp logout` | Remove the saved sign-in |
| `bladecp whoami` | Show the account and key in use |
| `bladecp` | On a terminal: welcome screen with what needs you right now |
| `bladecp servers list [--all]` | List your servers (`--all` also shows deleted ones) |
| `bladecp servers show <uuid>` | Show a server and its resource usage |
| `bladecp destinations list [--currency <code>]` | Plans, disk, monthly prices and locations available for migrations |
| `bladecp analyze <backup.tar.gz> [--prices]` | Show what a cPanel backup holds and what comes to BladeCP, offline |
| `bladecp migrate <backup.tar.gz>` | Upload a cPanel backup and migrate the site |
| `bladecp migrations list` | List your migrations |
| `bladecp migrations status <uuid> [--watch]` | Show a migration, or follow it |
| `bladecp migrations review <uuid> --domain <host>` | Confirm the domain of a migration |
| `bladecp migrations approve <uuid> [--yes]` | Approve after checking the preview |
| `bladecp migrations cancel <uuid> [--reason <text>] [--yes]` | Cancel a migration |
| `bladecp migrations retry <uuid>` | Try a failed migration again |
| `bladecp update [--check] [--yes]` | See what changed and update the CLI |
| `bladecp config list` / `get <key>` / `set <key> <value>` | Preferences: `auto-update`, `update-check`, `lang` |

#### Sites

| Command | What it does |
| --- | --- |
| `bladecp domains list <server>` | List the domains of a server |
| `bladecp domains add <server> <host>` | Add a domain to a server |
| `bladecp domains remove <server> <host> [--yes]` | Remove a domain from a server |
| `bladecp domains check <host>` | Check whether a domain can be used on BladeCP |
| `bladecp apps list` | List the apps BladeCP can install for you |
| `bladecp apps show <app>` | Show an app and the settings it needs |
| `bladecp apps install <server> <app> [--domain <host>] [--app-version <version>] [--option <id>=<value>]... [--yes]` | Install an app on a domain of a server |
| `bladecp wordpress status <server> [--external-id <id>]` | Check whether the WordPress tools work on a server |
| `bladecp wordpress dashboard <server> [--external-id <id>] [--wait]` | See the WordPress version, plugins and themes of a server |
| `bladecp wordpress update core <server> [--external-id <id>] [--wait] [--yes]` | Update WordPress itself to its newest version |
| `bladecp wordpress update plugin <server> <plugin> [--external-id <id>] [--wait] [--yes]` | Update a plugin to its newest version |
| `bladecp wordpress update theme <server> <theme> [--external-id <id>] [--wait] [--yes]` | Update a theme to its newest version |
| `bladecp wordpress task <server> <task> [--external-id <id>] [--wait]` | See how a WordPress task went |
| `bladecp components list` | List the components of the BladeCP catalog |

#### Partners (partner keys)

| Command | What it does |
| --- | --- |
| `bladecp partner plans [--currency <code>]` | List the plans you sell, with their prices |
| `bladecp partner locations [--plan <id>]` | List where each plan can run |
| `bladecp partner options [--plan <id>] [--currency <code>]` | List the configurable options and their values |
| `bladecp partner branding` | Show the name, logo and favicon of your brand |
| `bladecp partner servers list [--status <status>] [--domain <host>] [--external-id <id>] [--page <n>] [--limit <n>]` | List your customers' servers, with filters |
| `bladecp partner servers create --plan <id> --location <id> --domain <host> --email <email> --name <name> [--external-id <id>] [--option <id>=<value>]... [--component <slug>]... [--contract <months>] [--yes]` | Create a server for a customer |
| `bladecp partner servers plan <server> <plan> [--yes]` | Move a server to another plan |
| `bladecp partner servers options <server> --option <id>=<value>... [--yes]` | Replace the configurable options of a server |
| `bladecp partner servers suspend <server> [--yes]` | Suspend a server (nothing is deleted) |
| `bladecp partner servers unsuspend <server> [--yes]` | Bring a suspended server back |
| `bladecp partner servers cancel <server> [--now] [--reason <text>] [--reason-category <category>] [--yes]` | Cancel a server now or at the end of the cycle |
| `bladecp partner servers delete <server> [--yes]` | Delete a server and everything on it |
| `bladecp partner servers open <server>` | Open the customer's panel with a one-time link |
| `bladecp partner vibe find <external-id>` | Find the Vibe account of one of your services |
| `bladecp partner vibe show <account>` | Show a Vibe account |
| `bladecp partner vibe create --external-id <id> --plan <id> --email <email> --name <name> [--email-verification <verified|not-required>] [--yes]` | Create the Vibe account of a service |
| `bladecp partner vibe plan <account> <plan> [--yes]` | Move a Vibe account to another plan |
| `bladecp partner vibe suspend <account> [--yes]` | Suspend a Vibe account |
| `bladecp partner vibe reactivate <account> [--yes]` | Reactivate a suspended Vibe account |
| `bladecp partner vibe resume <account> [--yes]` | Bring a Vibe account back online after inactivity |
| `bladecp partner vibe terminate <account> [--yes]` | Terminate a Vibe account for good |
| `bladecp partner vibe open <account> [--no-browser]` | Sign in to Vibe as the account owner, with a one-time link |
| `bladecp partner marketplace summary` | Show earnings by currency and how much of your base server they cover |
| `bladecp partner marketplace orders [--status <status>] [--page <n>] [--limit <n>]` | List the sales BladeCP made of your plans |
| `bladecp partner marketplace commissions [--status <status>] [--page <n>] [--limit <n>]` | List each paid invoice: the sale, the BladeCP commission and what you receive |
| `bladecp partner marketplace statements` | List the monthly statements: your earnings netted against your base server |
| `bladecp partner marketplace statement <statement>` | Show one statement and its commission lines |
| `bladecp partner marketplace invoices` | List the open invoices of your base server |
| `bladecp partner webhooks list` | List your webhook endpoints |
| `bladecp partner webhooks show <endpoint>` | Show an endpoint: address, events and status |
| `bladecp partner webhooks create --url <url> --event <type>... [--name <name>]` | Add an endpoint and get its signing secret |
| `bladecp partner webhooks update <endpoint> [--url <url>] [--event <type>...] [--name <name>] [--yes]` | Change the address, events or name of an endpoint |
| `bladecp partner webhooks pause <endpoint> [--yes]` | Stop sending events to an endpoint for now |
| `bladecp partner webhooks resume <endpoint> [--yes]` | Send events to a paused endpoint again |
| `bladecp partner webhooks delete <endpoint> [--yes]` | Delete an endpoint |
| `bladecp partner webhooks rotate-secret <endpoint> [--yes]` | Replace the signing secret of an endpoint |
| `bladecp partner webhooks deliveries [--endpoint <id>] [--status <status>] [--page <n>] [--limit <n>]` | List what BladeCP sent and what your system answered |
| `bladecp partner webhooks replay <delivery> [--yes]` | Send a delivery again, with the same event ID |
| `bladecp partner migrations list --installation <id> [--client <id>] [--limit <n>] [--all]` | List the Fast Deploy requests of a WHMCS installation |
| `bladecp partner migrations show <request> --installation <id> --client <id> [--watch]` | Show a request: phase, components, preview and billing |
| `bladecp partner migrations review <request> --installation <id> --client <id> --domain <host>` | Confirm the domain of the site found in the backup |
| `bladecp partner migrations approve <request> --installation <id> --client <id> [--yes]` | Approve the preview so BladeCP finishes the migration |
| `bladecp partner migrations cancel <request> --installation <id> --client <id> [--reason <text>] [--yes]` | Cancel a request that is not approved yet |
| `bladecp partner migrations retry <request> --installation <id> --client <id>` | Try a failed migration again, when that is safe |
| `bladecp partner migrations billing-queue [--limit <n>] [--all]` | List the requests waiting for the billing WHMCS |
| `bladecp partner migrations billing-link <request> --installation <id> --client <id> --external-id <id> --email <email> --name <name> [--company <name>] [--yes]` | Link a request to its client and service in the billing WHMCS |
| `bladecp partner migrations claim-url <request> --installation <id> --client <id>` | Get the address where the account holder confirms the account |

#### Automation

| Command | What it does |
| --- | --- |
| `bladecp api <path> [-X <method>] [--data <json> | --input <file>] [--yes]` | Call any Customer API route with your sign-in |
| `bladecp api list` | List every API route and the command that covers it |

Partner commands need a key with the `partner:read` scope; with a customer key they stop with `partner_only` (exit 4). The WordPress commands need `--external-id`, the service ID in the billing system.

Global options: `--json`, `--api-url <url>` (or `BLADECP_API_URL`, default
`https://api.bladecp.com`), `--lang en|pt-BR|es`, `--debug` (or `--verbose`),
`--help`, `--version`. Where a command takes an ID, its first characters are
enough (at least 4) when only one of yours starts with them. The
[command reference](docs/commands.md) has every option.

### What the CLI takes care of

- **Fewer steps.** On a terminal, `migrate` asks only where the site goes, a
  confirmation and, when the backup needs it, the domain. Every question has an
  equivalent option.
- **Destination never guessed.** Without a terminal it never chooses where the
  site goes: pass `--plan` and `--location`, or `--yes` when your account has
  exactly one destination.
- **Never asks twice.** Once the domain of a migration is confirmed, the CLI
  keeps waiting for BladeCP to continue instead of asking again.
- **Complete at approval.** A migration is complete once its preview is
  approved. Pointing the domain is optional; the CLI shows the BladeCP
  nameservers and, when the API returns it, the address for an A record.
- **Says when something is slow.** A phase that takes longer than usual is
  flagged on screen (and in `--json` as `slowPhase`), with how to follow it
  later and, when it is very long, how to reach support.
- **Fits your window.** Tables, help and progress adapt to 40, 80 or 120
  columns; the percentage of an upload is always visible.
- **Keeps itself current.** Once a day the CLI asks npm for the latest version
  and shows one quiet line at the end of an interactive command. `bladecp
  update` shows what changed and updates with the package manager that
  installed it. Nothing else is sent.
- **Three languages.** Messages in English, Brazilian Portuguese and Spanish,
  from `LC_ALL`, `LC_MESSAGES` or `LANG`, from `bladecp config set lang`, or
  chosen with `--lang`.

## Architecture

The CLI separates what happens on your computer, what it keeps there and what
goes to BladeCP. The key is sent only to the API address in use, over HTTPS,
and the backup parts go straight to storage through presigned URLs.

<p align="center">
  <picture>
    <source media="(max-width: 600px)" srcset="https://raw.githubusercontent.com/bladecp/bladecp-cli/main/assets/architecture-compact.en.svg">
    <img src="https://raw.githubusercontent.com/bladecp/bladecp-cli/main/assets/architecture.en.svg" alt="BladeCP CLI architecture. On your computer or in CI, the terminal, scripts and AI agents run the commands, the browser answers the sign-in on 127.0.0.1 and the cPanel backup is read in parts. The CLI keeps the sign-in in a private config.json, prints escaped output with the key redacted, and its API client calls the Customer API at api.bladecp.com over HTTPS. The resumable upload sends the backup parts straight to storage through presigned URLs and records its progress locally, and the CLI follows the migration through preview and approval." width="100%">
  </picture>
</p>

<p align="center"><sub>Logical view of the CLI. <a href="assets/architecture.en.svg">Open the diagram at full size</a>.</sub></p>

### From the backup to the approved site

1. **Local checks.** `bladecp migrate` checks the file: a regular, non-empty
   file of up to 50 GB that starts with the gzip signature of a `.tar.gz`
   backup.
2. **Destination.** The migration is created at the plan and location you
   chose, from `bladecp destinations list`.
3. **Resumable upload.** The API client asks the Customer API for presigned
   URLs, and each part goes straight to storage, three at a time. A part that
   fails is retried with a growing wait. Progress is saved locally, never the
   key.
4. **Follow.** BladeCP confirms the backup and the CLI follows each phase. If
   the domain must be confirmed, it asks once; Enter accepts the domain found in
   the backup.
5. **Preview and approval.** When the site is ready, the CLI prints the preview
   address and the command to approve it, and ends with exit code `0`. After you
   approve, the migration is complete.

| Layer | Responsibility |
| --- | --- |
| **Commands** | Arguments, questions only on a terminal, language |
| **Output** | Text or the `--json` envelope; external text escaped, key redacted |
| **Sign-in** | Browser (PKCE S256, answer on `127.0.0.1`), `--token` or `BLADECP_API_KEY`, saved in a private `config.json` |
| **API client** | HTTPS with the Bearer key, `429` with `Retry-After`, retries |
| **Upload** | Parts from the BladeCP upload plan, streamed with an explicit length, resumed from local progress |
| **Local state** | The CLI folder: the saved sign-in and the progress of interrupted uploads |

<a id="installation"></a>

## Quick installation

You need Node.js 20 or later, on macOS, Linux or Windows, and outbound HTTPS to
`api.bladecp.com` (and to `hub.bladecp.com` in your browser for the sign-in).

```sh
npm install -g @bladecp/cli
bladecp --version
```

Or run it without installing:

```sh
npx @bladecp/cli login
```

### Verify a release download

Every [GitHub release](https://github.com/bladecp/bladecp-cli/releases) attaches
the npm package tarball, its checksum and the release notes. The tarball is the
same file published to npm.

| File | Purpose |
| --- | --- |
| [**bladecp-cli-0.3.2.tgz**](https://github.com/bladecp/bladecp-cli/releases/download/v0.3.2/bladecp-cli-0.3.2.tgz) | The npm package: `dist/`, READMEs, changelog, license and `package.json` |
| [**SHA256SUMS**](https://github.com/bladecp/bladecp-cli/releases/download/v0.3.2/SHA256SUMS) | Checksum to verify the tarball |
| [**RELEASE_NOTES.md**](https://github.com/bladecp/bladecp-cli/releases/download/v0.3.2/RELEASE_NOTES.md) | Notes for this version |

```sh
shasum -a 256 -c SHA256SUMS          # on Linux: sha256sum -c SHA256SUMS
npm install -g ./bladecp-cli-0.3.2.tgz
```

### Update and uninstall

```sh
bladecp update                       # what changed, then updates with npm, pnpm, yarn or bun
bladecp config set auto-update off   # stop updating on its own before a command
bladecp logout                       # removes the saved key from this computer
npm uninstall -g @bladecp/cli
```

The daily version check only asks the npm registry for the latest version
number. Turn it off with `BLADECP_NO_UPDATE_CHECK=1`, `NO_UPDATE_NOTIFIER` or
`bladecp config set update-check off`.

`bladecp logout` does not revoke the key: revoke it at
[API keys](https://hub.bladecp.com/account/api-keys). The
[installation guide](docs/installation.md) has the details.

## First steps

```sh
bladecp login                        # opens your browser, one click to authorize
bladecp whoami                       # the account and key in use
bladecp servers list                 # your servers
bladecp destinations list            # plans and locations for migrations
bladecp analyze cpmove-user.tar.gz   # what migrates and the minimum plan, offline
bladecp migrate cpmove-user.tar.gz   # uploads, follows the migration, prints the preview
bladecp migrations approve <uuid>    # after you check the preview
```

### Sign in

| Method | When to use it |
| --- | --- |
| `bladecp login` | Your own computer. Opens the Hub in your browser; you authorize the BladeCP CLI and the terminal receives a key valid for 30 days. |
| `bladecp login --no-browser` | The browser did not open. The address is printed so you can open it yourself on the same computer. |
| `bladecp login --token <key>` | You already have an API key from the Hub ([API keys](https://hub.bladecp.com/account/api-keys)). Use `--token -` to read it from stdin so it stays out of your shell history. |
| `BLADECP_API_KEY=<key>` | Scripts, CI and remote servers. Nothing is saved; every command uses the variable. |

The key is saved in `~/.config/bladecp/config.json` (macOS and Linux) or
`%APPDATA%\bladecp\config.json` (Windows), readable only by you. The CLI never
prints it. See [authentication](docs/authentication.md).

### Analyze a backup before migrating

`bladecp analyze` reads a full cPanel backup on your computer, once and as a
stream, and shows:

- **what the backup holds:** the account, the sites (main, addon domains and
  subdomains, with WordPress and the PHP version of each), the databases with
  engine and version, email domains and mailboxes, DNS zones, cron jobs, files
  and size;
- **what comes to BladeCP and what stays behind:** the sites and their files,
  every MySQL and MariaDB database, the mailboxes over IMAP and POP3 with MX
  kept, the whole DNS zone, cron jobs and the PHP version of each site come;
  SSL certificates are issued again when the domain points to BladeCP, and the
  cPanel password stays (you sign in to BladeCP with your email);
- **notes and refusals:** when the migration would refuse the backup as it is
  (a damaged or cut file, a site that is not WordPress, an active WordPress
  Multisite, a value of `wp-config.php` it does not accept), it says why and
  what to do;
- **the minimum plan:** disk and databases, and the `bladecp migrate` command
  ready to run.

| Flag | Effect |
| --- | --- |
| `--prices` | Also show the cheapest plan of your account that fits, with the price of now and the `--plan` and `--location` to use. Needs sign-in; sends only the currency |
| `--currency <code>` | Prices in one currency, with `--prices` |
| `--json` | The report in the `bladecp.analyze.v1` schema |

The analysis needs no sign-in and no network: nothing from the backup leaves
your computer, and passwords, keys and the text of `wp-config.php` never appear
on the screen or in the report. Exit code `0` means the backup migrates (maybe
with notes) and `6` that it does not migrate as it is.

The same analyzer is a library with no dependencies, for Node and browsers:

```js
import { analyzeFile } from '@bladecp/cli/analyzer/node';

const report = await analyzeFile('cpmove-user.tar.gz');
console.log(report.verdict, report.blockers, report.requirements);
```

`@bladecp/cli/analyzer/web` reads a `File` or `Blob` (in a Web Worker, for
example) with the analyzer's own gzip reader, so it does not depend on the
browser's `DecompressionStream`.

### Migrate a cPanel backup

Use the full backup generated by cPanel, for example `cpmove-user.tar.gz`, up
to 50 GB.

| Flag | Effect |
| --- | --- |
| `--plan <id> --location <id>` | Destination, from `bladecp destinations list` |
| `--domain <host>` | Domain the migrated site will use |
| `--yes` | No confirmation; accept the domain found in the backup and, when your account has exactly one destination, that destination. It never approves the migration |
| `--no-wait` | Stop once the backup is received |

**Interrupted upload?** Run the same command again. The CLI remembers the
migration for that file and sends only the missing parts. If the backup was
already received, it simply continues following the migration.

On a terminal, when the preview is ready, `o` opens it and `a` approves; `d`
decides later. Pressing Ctrl+C while the migration is being followed only stops
watching; the migration continues. Check it later with
`bladecp migrations status <uuid> --watch`.

<a id="automation"></a>

## Automation and JSON

With `--json`, every command prints exactly one JSON document on stdout,
without colors, progress or questions:

```json
{ "ok": true, "data": { "migrationUuid": "…", "phase": "awaiting_approval", "previewUrl": "https://…", "nextAction": { "type": "approve", "command": "bladecp migrations approve …" } } }
```

Errors use the same envelope. `code` is stable; `message` follows the selected
language:

```json
{ "ok": false, "error": { "code": "not_found", "message": "…", "exitCode": 5, "status": 404 } }
```

A fully non-interactive migration:

```sh
BLADECP_API_KEY=… bladecp migrate site.tar.gz --plan 12 --location 3 --domain example.com --json
```

`migrations status --watch --json` prints one JSON line per change, errors
included, and ends with exit code `0` once the migration is complete. Read
commands return the API objects unchanged in `data`; the CLI only adds fields
such as `domainPointing` and `slowPhase`. `--help --json` returns the help as
one document. The [automation guide](docs/automation.md)
describes every field, with a GitHub Actions example.

`bladecp analyze --json` always answers `{ "ok": true, "data": <report> }`,
also when the backup does not migrate (exit code `6`): decide on `verdict`
(`supported`, `supported_with_warnings` or `blocked`), `blockers` and
`warnings`, whose `code` values are listed in `reference.json`.

| Code | Meaning |
| --- | --- |
| 0 | Success (for `migrate`, the site is ready for review) |
| 1 | Unexpected error |
| 2 | Invalid usage or input (flag, file, missing destination without a terminal) |
| 3 | Not signed in, key not accepted, or sign-in failed |
| 4 | Permission denied |
| 5 | Not found |
| 6 | Rejected by the API (for example, an action not available in the current phase), or a backup that does not migrate as it is (`analyze`) |
| 7 | Rate limited |
| 8 | Network or server error, or upload failure |
| 9 | Migration failed or was cancelled |
| 10 | Waiting for your action (for example, confirm the domain) |
| 11 | Update required (the API no longer accepts this version: run `bladecp update`) |
| 130 | Interrupted |

| Variable | Purpose |
| --- | --- |
| `BLADECP_API_KEY` | API key to use instead of the saved sign-in |
| `BLADECP_API_URL` | API address (same as `--api-url`) |
| `BLADECP_HUB_URL` | Hub address for the sign-in and links (default: the Hub of the API address) |
| `BLADECP_CONFIG_DIR` | Folder for the saved sign-in, preferences and upload progress (`~` is expanded) |
| `BLADECP_NO_UPDATE_CHECK` | `1` never checks for a new version (`NO_UPDATE_NOTIFIER` also works) |
| `BLADECP_MOTION` | `off` shows the B without animation, `reduced` only its last frame |
| `NO_COLOR` | Disable colors (any value that is not empty) |
| `FORCE_COLOR` | Force colors (`1`, `2` or `3`), also in pipes, or disable them (`0`) |
| `CI` | Never ask and never animate |

[`reference.json`](reference.json) lists every command, option, alias, exit code
and error code, with messages in the three languages, for tools that should not
parse help output.

## Documentation

| Guide | What you will find |
| --- | --- |
| [Installation](docs/installation.md) | Requirements, npm, checksum, update, uninstall and building from source |
| [Authentication](docs/authentication.md) | Browser sign-in, keys, where the key is saved and sign-in errors |
| [Commands](docs/commands.md) | Every command, option, exit code and environment variable |
| [Automation and JSON](docs/automation.md) | Non-interactive use, the JSON envelope, retries and CI |
| [Troubleshooting](docs/troubleshooting.md) | Installation, sign-in, migration and network problems |
| [Release process](docs/release-process.md) | How public releases are prepared and verified |
| [Repository governance](docs/repository-governance.md) | Issues, pull requests, history and releases |
| [Changelog](CHANGELOG.md) | Changes in each public version |
| [Security policy](SECURITY.md) | Private vulnerability reporting |
| [Contributing](CONTRIBUTING.md) | How to propose and validate a change |

The developer guide at [developers.bladecp.com/cli](https://developers.bladecp.com/cli)
covers the CLI together with the Customer API.

## Security

- **The key stays private.** It is sent only to the API address in use, over
  HTTPS; plain HTTP is accepted only for `localhost`. It never appears in output,
  errors or upload progress files, and the saved credentials are readable only
  by you.
- **Safe browser sign-in.** A one-time code with PKCE (S256) and a random
  `state`, received on `127.0.0.1`. An answer this terminal did not start is
  ignored.
- **A terminal that cannot be hijacked.** Text received from the API, the
  network or file names is shown with control characters escaped, so it cannot
  change your screen, links, title or clipboard.
- **Nothing extra to trust.** No runtime dependencies: native `fetch`,
  `util.parseArgs`, `http(s)` and `readline`. Each release publishes the
  verified tarball and its SHA-256 checksum.
- **Logout is local.** `bladecp logout` removes the key from the computer; the
  Customer API has no route to revoke the key in use, so revoke a key you no
  longer use at [API keys](https://hub.bladecp.com/account/api-keys).
- **No telemetry.** The daily version check asks the npm registry for one
  version number, nothing else, and can be turned off.

To report a vulnerability privately, follow [SECURITY.md](SECURITY.md). Never
include an API key in a public issue.

<a id="quality"></a>

## Quality and validation

Version `0.3.2` was validated by the maintainers with **1148 automated
tests** in 19 files, run with Vitest against a simulated Customer API
(`test/helpers/mock-api.ts`) and a simulated npm registry, never real ones.
They cover every command, migration and its phases, browser sign-in and the
local callback, saved credentials, the three message catalogs, the multipart
upload, updates, hostile terminal sequences, the `--json` snapshots,
`reference.json`, key redaction across every command, a photo of every screen
in 40, 80 and 120 columns in the three languages with and without color, and a
lock that keeps everything visual in one design kit. The tests badge represents
that run.

Before a release, the package is built from the curated public tree, the tree
and the tarball are scanned for credentials and non-public references, and the
tarball itself is installed in a disposable prefix to run `bladecp --version`
and `bladecp --help`.

The [public CI](https://github.com/bladecp/bladecp-cli/actions/workflows/ci.yml)
runs lint, type checking, tests, the build, the `reference.json` check and the
public tree gate (`scripts/check-public-tree.sh --package`) on Node.js 24, and
the build and tests on Node.js 20.

<a id="development"></a>

## Development and contributing

Development uses Node.js 24 (see `.nvmrc`) and the pnpm version in the
`packageManager` field of `package.json`.

```sh
git clone https://github.com/bladecp/bladecp-cli.git
cd bladecp-cli
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test
pnpm build && node dist/bin.js --help
bash scripts/check-public-tree.sh --package
```

```text
src/
  bin.ts, cli.ts   Entry point, parsing, dispatch and error report
  commands/        account, servers, migrate, migrations, follow, home, update, config
  ui/              The design kit: output, terminal, pieces, questions and the 3D B
  update/          Daily version check, install method and release notes
  auth/            Credentials, PKCE and the 127.0.0.1 callback
  upload/          Part plan, streamed PUT, local state and uploader
  i18n/            English (base), Portuguese (Brazil) and Spanish
test/              Vitest suite with a simulated Customer API
scripts/           Build helpers and the public tree gate
docs/              Guides
assets/            README artwork
reference.json     Machine-readable reference
```

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before
opening an issue or pull request: every message exists in the three languages,
every screen is built with the design kit in `src/ui/`, external text never
reaches the terminal unescaped, the key never reaches the output, and a change
to a command or message regenerates `reference.json`.
Approved contributions follow the project maintenance workflow before they
appear in a later public release.

<a id="faq"></a>

## Frequently asked questions

<details>
<summary><strong>Do I need anything besides Node.js?</strong></summary>

No. The package has no runtime dependencies. Node.js 20 or later is enough, on
macOS, Linux or Windows.

</details>

<details>
<summary><strong>Can I sign in on a remote server over SSH?</strong></summary>

Yes, with a key. The browser sign-in answers on `127.0.0.1` of the computer that
runs the CLI, so on a remote server create a key at
[API keys](https://hub.bladecp.com/account/api-keys) and use
`bladecp login --token -` or `BLADECP_API_KEY`.

</details>

<details>
<summary><strong>The upload stopped. Do I start over?</strong></summary>

No. Run the same `bladecp migrate` command with the same file. The CLI sends
only the missing parts, or continues following the migration if the backup was
already received.

</details>

<details>
<summary><strong>Does pointing the domain hold a migration back?</strong></summary>

No. A migration is complete once its preview is approved. Pointing the domain
is optional and can wait as long as you want; meanwhile, the old site stays
online.

</details>

<details>
<summary><strong>Is it safe to run from scripts and AI agents?</strong></summary>

Yes. With `--json` there are no prompts, no colors and exactly one JSON
document. Without a terminal the CLI never chooses the destination, and exit
codes and error codes are stable.

</details>

<details>
<summary><strong>"Your API key was not accepted" or "has expired". What now?</strong></summary>

Run `bladecp login` again, or create a new key at
[API keys](https://hub.bladecp.com/account/api-keys). The
[troubleshooting guide](docs/troubleshooting.md) covers the common error codes.

</details>

## Support

| Subject | Channel |
| --- | --- |
| Reproducible bug or product request | [GitHub Issues](https://github.com/bladecp/bladecp-cli/issues) |
| Technical and product support | [dev@bladecp.com](mailto:dev@bladecp.com) |
| Vulnerability | [Security policy](SECURITY.md) |
| Guides | [developers.bladecp.com/cli](https://developers.bladecp.com/cli) |

In public reports, include the CLI version, the Node.js version, the operating
system, the command and the error `code`. Never include an API key.

## License

The BladeCP CLI is released under the [MIT License](LICENSE). The CLI license
does not replace the terms of BladeCP services.

<p align="center"><strong>BladeCP. Your sites, one command away.</strong></p>
