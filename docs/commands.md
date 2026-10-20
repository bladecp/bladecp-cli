# Command reference

```text
bladecp <command> [options]
```

Run `bladecp --help`, `bladecp <command> --help`, `bladecp help <command>` or
`bladecp <group> --help` (for example `bladecp migrations --help`) for the same
information in the terminal; add `--json` to get it as one JSON document. A
machine-readable version of this reference (commands, options, aliases, exit
codes and error codes, in the three languages) is kept in
[`reference.json`](../reference.json).

On an interactive terminal, `bladecp` alone shows a welcome screen: the account
in use, what needs you right now (for example a migration ready for review) and
the shortcuts. Without a terminal it prints the help.

**Short IDs.** Every command that takes a server or migration `<uuid>` (or a `<server>`) also
accepts its first characters (at least 4), when only one of yours starts with
them. When several match, the CLI says so (`ambiguous_id`, exit code 2).

## Global options

| Option | Effect |
|---|---|
| `--json` | Print machine-readable JSON (no colors, no prompts). See [automation and JSON](automation.md). |
| `--api-url <url>` | API address. Default `https://api.bladecp.com`, or `BLADECP_API_URL`. |
| `--lang <en\|pt-BR\|es>` | Language for messages. By default it comes from `bladecp config set lang`, then `LC_ALL`, `LC_MESSAGES` or `LANG`. |
| `--debug`, `--verbose` | Describe each request on stderr (method, path, status, time). The key is never shown. |
| `-h`, `--help` | Show help. |
| `-v`, `--version` | Show the version. |

## Account

### `bladecp login [--token <key>] [--no-browser]`

Sign in with your browser or an API key.

| Option | Effect |
|---|---|
| `--token <key>` | Save this API key instead of signing in with the browser. `-` reads it from stdin. |
| `--no-browser` | Do not open the browser; print the sign-in address instead. |

See [authentication](authentication.md).

### `bladecp logout`

Remove the saved sign-in from this computer. The key itself stays valid until
it expires or you revoke it in the Hub at
[API keys](https://hub.bladecp.com/account/api-keys); the Customer API has no
route for a key to revoke itself.

### `bladecp whoami`

Show the account and key in use: account ID and email, key ID and where it
comes from (saved sign-in or `BLADECP_API_KEY`), scopes, rate limit, expiry and
API address.

## Servers

### `bladecp servers list [--all]`

List your servers, with their status in words. `bladecp servers` does the same.
Deleted servers are hidden unless you add `-a` or `--all`; with `--json` every
server is always listed.

### `bladecp servers show <uuid>`

Show a server and its resource usage. A metric BladeCP has not measured yet
reads "not measured yet".

## Destinations

### `bladecp destinations list [--currency <code>]`

List the plans and locations available for migrations, with disk size and
monthly prices. `bladecp destinations` does the same.

| Option | Effect |
|---|---|
| `--currency <code>` | Show plans and prices in one currency, for example `USD` or `BRL`. |

## Migrations

### `bladecp analyze <backup.tar.gz> [--prices [--currency <code>]]`

See what a full cPanel backup holds and what comes to BladeCP, before you
migrate. The backup is read on your computer, once and as a stream (up to
50 GB, without loading it into memory); nothing is sent and no sign-in is
needed.

| Option | Effect |
|---|---|
| `--prices` | Also show the cheapest plan of your account that fits the backup, with the price of now and the `--plan` and `--location` to migrate to it. Needs sign-in; the only request is the list of plans, with the currency. |
| `--currency <code>` | Prices in one currency, for example `USD` or `BRL` (with `--prices`). |

The report shows the account, the sites (main, addon domains and subdomains,
with WordPress and the PHP version of each), the databases with engine and
version, email, DNS zones, cron jobs and files; what comes to BladeCP and what
stays behind; the notes; and the minimum plan (disk and databases). When the
migration would refuse the backup as it is, it says why and what to do.

| Exit code | Meaning |
|---|---|
| 0 | The backup migrates (maybe with notes) |
| 2 | The file is missing, empty or not a file |
| 6 | The backup does not migrate as it is |

With `--json` the report follows the `bladecp.analyze.v1` schema and the
envelope is always `{ "ok": true, "data": ... }`, also with exit code `6`.
`reference.json` lists every `verdict`, blocker and warning code. Passwords,
keys and the text of `wp-config.php` never appear in the report.

### `bladecp migrate <backup.tar.gz> [--plan <id> --location <id>] [--domain <host>] [--yes] [--no-wait]`

Upload a cPanel backup and migrate the site to BladeCP.

| Option | Effect |
|---|---|
| `--plan <id>` | Destination plan ID, from `bladecp destinations list`. |
| `--location <id>` | Destination location ID, from `bladecp destinations list`. |
| `--domain <host>` | Domain the migrated site will use. |
| `-y`, `--yes` | Do not ask for confirmation; accept the domain found in the backup and, when your account has exactly one destination, that destination. It never approves the migration. |
| `--no-wait` | Stop after the backup is received instead of following the migration. |

What happens:

1. The file is checked locally: it is a regular file, is not empty, is not
   larger than 50 GB and starts with the gzip signature of a `.tar.gz` backup.
2. A migration is created at the destination you chose. On an interactive
   terminal the CLI asks only what it cannot find out by itself: the
   destination (arrow keys) and a confirmation that shows the plan, the
   location and the monthly price. Without a terminal it never chooses the
   destination: pass `--plan` and `--location`, or `--yes` when your account
   has exactly one destination.
3. The backup is uploaded in parts, three at a time. A part that fails is
   retried with a growing wait.
4. BladeCP confirms the backup and the CLI follows the migration phases.
5. If BladeCP needs the domain confirmed, the CLI asks for it once (press
   Enter to accept the domain found in the backup).
6. When the site is ready, the CLI prints the preview address and the command
   to approve it. On an interactive terminal (without `--yes`) you can press
   `o` to open the preview, `a` to approve right there (the CLI then follows
   the migration to the end) or `d` to decide later. The exit code is `0`.

A phase that takes longer than usual is flagged, with how to follow the
migration later and, when it takes much longer, how to reach support. The
migration keeps going even if you leave.

An interrupted upload continues where it stopped when you run the same command
again with the same file. Running it again with another `--plan` or
`--location` while that migration is in progress asks first on a terminal and
is refused elsewhere (`migration_in_progress`), so it never continues on a
destination you did not choose. Ctrl+C while the migration is being followed
only stops watching; the migration continues.

### `bladecp migrations list`

List your migrations. `bladecp migrations` does the same.

### `bladecp migrations status <uuid> [--watch]`

Show a migration. With `-w` or `--watch`, keep following it until it needs you
or finishes. A migration is complete once its preview is approved; pointing the
domain is optional, and the CLI shows the BladeCP nameservers and, when the API
returns it, the address for an A record.

### `bladecp migrations review <uuid> --domain <host>`

Confirm which domain a migration uses.

### `bladecp migrations approve <uuid> [--yes]`

Approve a migration after checking the preview. On an interactive terminal it
shows the preview address and asks first; `-y` or `--yes` skips the question.
Approving is always this explicit command (or the key `a` in `migrate`).

### `bladecp migrations cancel <uuid> [--reason <text>] [--yes]`

Cancel a migration. `--reason` adds an optional note about why. On an
interactive terminal it asks first, with "no" as the default; `--yes` skips
the question.

### `bladecp migrations retry <uuid>`

Try a failed migration again. When a new attempt is not available, the error
says why (for example, the backup is no longer stored).

## Sites

Domains, apps, WordPress and components of your servers. Every command that
takes a `<server>` accepts its first characters too.

### `bladecp domains list <server>`

List the domains of a server.

### `bladecp domains add <server> <host>`

Add a domain to a server.

### `bladecp domains remove <server> <host> [--yes]`

Remove a domain from a server.

| Option | Meaning |
| --- | --- |
| `-y, --yes` | Do not ask before removing on a terminal |

### `bladecp domains check <host>`

Check whether a domain can be used on BladeCP.

### `bladecp apps list`

List the apps BladeCP can install for you.

### `bladecp apps show <app>`

Show an app and the settings it needs.

### `bladecp apps install <server> <app> [--domain <host>] [--app-version <version>] [--option <id>=<value>]... [--yes]`

Install an app on a domain of a server.

| Option | Meaning |
| --- | --- |
| `--domain <host>` | Domain of the server to install it on (the main one when left out) |
| `--app-version <version>` | Version to install (the recommended one when left out) |
| `--option <id>=<value>` | A setting of the app as name=value (repeat for each one) |
| `-y, --yes` | Do not ask before installing on a terminal |

### `bladecp wordpress status <server> [--external-id <id>]`

Check whether the WordPress tools work on a server.

| Option | Meaning |
| --- | --- |
| `--external-id <id>` | ID of this service in the billing system where you bought it |

### `bladecp wordpress dashboard <server> [--external-id <id>] [--wait]`

See the WordPress version, plugins and themes of a server.

| Option | Meaning |
| --- | --- |
| `--external-id <id>` | ID of this service in the billing system where you bought it |
| `--wait` | Wait for the result and show it |

### `bladecp wordpress update core <server> [--external-id <id>] [--wait] [--yes]`

Update WordPress itself to its newest version.

| Option | Meaning |
| --- | --- |
| `--external-id <id>` | ID of this service in the billing system where you bought it |
| `--wait` | Wait until the update ends and show how it went |
| `-y, --yes` | Do not ask before updating on a terminal |

### `bladecp wordpress update plugin <server> <plugin> [--external-id <id>] [--wait] [--yes]`

Update a plugin to its newest version.

| Option | Meaning |
| --- | --- |
| `--external-id <id>` | ID of this service in the billing system where you bought it |
| `--wait` | Wait until the update ends and show how it went |
| `-y, --yes` | Do not ask before updating on a terminal |

### `bladecp wordpress update theme <server> <theme> [--external-id <id>] [--wait] [--yes]`

Update a theme to its newest version.

| Option | Meaning |
| --- | --- |
| `--external-id <id>` | ID of this service in the billing system where you bought it |
| `--wait` | Wait until the update ends and show how it went |
| `-y, --yes` | Do not ask before updating on a terminal |

### `bladecp wordpress task <server> <task> [--external-id <id>] [--wait]`

See how a WordPress task went.

| Option | Meaning |
| --- | --- |
| `--external-id <id>` | ID of this service in the billing system where you bought it |
| `--wait` | Wait until the task ends |

### `bladecp components list`

List the components of the BladeCP catalog.

## Partners

For BladeCP partners: keys with the `partner:read` scope. A partner command run
with a customer key stops with `partner_only` (exit code 4). Everything that
suspends, cancels, deletes, terminates, rotates a secret or changes a plan asks
first on a terminal; `--yes` skips the question, and without a terminal the
command itself is the explicit act. One-time values (a webhook signing secret,
a one-time sign-in link) are shown once.

### `bladecp partner plans [--currency <code>]`

List the plans you sell, with their prices.

| Option | Meaning |
| --- | --- |
| `--currency <code>` | Show prices in one currency only (for example BRL or USD) |

### `bladecp partner locations [--plan <id>]`

List where each plan can run.

| Option | Meaning |
| --- | --- |
| `--plan <id>` | Only the locations of this plan (ID from "bladecp partner plans") |

### `bladecp partner options [--plan <id>] [--currency <code>]`

List the configurable options and their values.

| Option | Meaning |
| --- | --- |
| `--plan <id>` | Only the options of this plan: its ID or UUID from "bladecp partner plans" |
| `--currency <code>` | Show prices in one currency only (for example BRL or USD) |

### `bladecp partner branding`

Show the name, logo and favicon of your brand.

### `bladecp partner servers list [--status <status>] [--domain <host>] [--external-id <id>] [--page <n>] [--limit <n>]`

List your customers' servers, with filters.

| Option | Meaning |
| --- | --- |
| `--status <status>` | Only the ones with this status |
| `--domain <host>` | Only the server with this main domain |
| `--external-id <id>` | Only the server with this service ID of your billing system |
| `--page <n>` | Page to show (starts at 1) |
| `--limit <n>` | How many per page (up to 100) |

### `bladecp partner servers create --plan <id> --location <id> --domain <host> --email <email> --name <name> [--external-id <id>] [--option <id>=<value>]... [--component <slug>]... [--contract <months>] [--yes]`

Create a server for a customer.

| Option | Meaning |
| --- | --- |
| `--plan <id>` | Plan ID (see "bladecp partner plans") |
| `--location <id>` | Location ID of the plan (see "bladecp partner locations") |
| `--domain <host>` | Main domain of the new server |
| `--email <email>` | Email of the customer who owns the server |
| `--name <name>` | Name of the customer who owns the server |
| `--external-id <id>` | The service ID in your billing system, to find the server later |
| `--option <id>=<value>` | Configurable option and value, by name or ID (see "bladecp partner options"); for a quantity, the number. Repeat for more than one |
| `--component <slug>[@<version>]` | Component to install, with an optional version (repeat for more than one) |
| `--contract <months>` | Contract term in months (12, 24, 36 or 48) for plans sold with a contract; records that the customer accepted the terms |
| `-y, --yes` | Do not ask for confirmation on a terminal |

### `bladecp partner servers plan <server> <plan> [--yes]`

Move a server to another plan.

| Option | Meaning |
| --- | --- |
| `-y, --yes` | Do not ask for confirmation on a terminal |

### `bladecp partner servers options <server> --option <id>=<value>... [--yes]`

Replace the configurable options of a server.

| Option | Meaning |
| --- | --- |
| `--option <id>=<value>` | Configurable option and value, by name or ID (see "bladecp partner options"); for a quantity, the number. Repeat for more than one |
| `-y, --yes` | Do not ask for confirmation on a terminal |

### `bladecp partner servers suspend <server> [--yes]`

Suspend a server (nothing is deleted).

| Option | Meaning |
| --- | --- |
| `-y, --yes` | Do not ask for confirmation on a terminal |

### `bladecp partner servers unsuspend <server> [--yes]`

Bring a suspended server back.

| Option | Meaning |
| --- | --- |
| `-y, --yes` | Do not ask for confirmation on a terminal |

### `bladecp partner servers cancel <server> [--now] [--reason <text>] [--reason-category <category>] [--yes]`

Cancel a server now or at the end of the cycle.

| Option | Meaning |
| --- | --- |
| `--now` | Cancel right away (the server is suspended now) instead of at the end of the cycle |
| `--reason <text>` | Why it is cancelled, at least 20 characters (kept with the request) |
| `--reason-category <category>` | Why it is cancelled: too-expensive, no-longer-needed, technical-issues, found-better, temporary or other |
| `-y, --yes` | Do not ask for confirmation on a terminal |

### `bladecp partner servers delete <server> [--yes]`

Delete a server and everything on it.

| Option | Meaning |
| --- | --- |
| `-y, --yes` | Do not ask for confirmation on a terminal |

### `bladecp partner servers open <server>`

Open the customer's panel with a one-time link.

### `bladecp partner vibe find <external-id>`

Find the Vibe account of one of your services.

### `bladecp partner vibe show <account>`

Show a Vibe account.

### `bladecp partner vibe create --external-id <id> --plan <id> --email <email> --name <name> [--email-verification <verified|not-required>] [--yes]`

Create the Vibe account of a service.

| Option | Meaning |
| --- | --- |
| `--external-id <id>` | Your ID for the service (for example the WHMCS service ID) |
| `--plan <id>` | UUID of the Vibe plan (see "bladecp partner plans") |
| `--email <email>` | Email of the account owner |
| `--name <name>` | Name of the account owner |
| `--email-verification <verified|not-required>` | Free plans: the owner's email was verified, or your store does not require it |
| `-y, --yes` | Do not ask for confirmation on a terminal |

### `bladecp partner vibe plan <account> <plan> [--yes]`

Move a Vibe account to another plan.

| Option | Meaning |
| --- | --- |
| `-y, --yes` | Do not ask for confirmation on a terminal |

### `bladecp partner vibe suspend <account> [--yes]`

Suspend a Vibe account.

| Option | Meaning |
| --- | --- |
| `-y, --yes` | Do not ask for confirmation on a terminal |

### `bladecp partner vibe reactivate <account> [--yes]`

Reactivate a suspended Vibe account.

| Option | Meaning |
| --- | --- |
| `-y, --yes` | Do not ask for confirmation on a terminal |

### `bladecp partner vibe resume <account> [--yes]`

Bring a Vibe account back online after inactivity.

| Option | Meaning |
| --- | --- |
| `-y, --yes` | Do not ask for confirmation on a terminal |

### `bladecp partner vibe terminate <account> [--yes]`

Terminate a Vibe account for good.

| Option | Meaning |
| --- | --- |
| `-y, --yes` | Do not ask for confirmation on a terminal |

### `bladecp partner vibe open <account> [--no-browser]`

Sign in to Vibe as the account owner, with a one-time link.

| Option | Meaning |
| --- | --- |
| `--no-browser` | Print the one-time link instead of opening the browser |

### `bladecp partner marketplace summary`

Show earnings by currency and how much of your base server they cover.

### `bladecp partner marketplace orders [--status <status>] [--page <n>] [--limit <n>]`

List the sales BladeCP made of your plans.

| Option | Meaning |
| --- | --- |
| `--status <status>` | Only sales with this status (active or churned) |
| `--page <n>` | Page to show (starts at 1) |
| `--limit <n>` | How many to show per page (up to 100) |

### `bladecp partner marketplace commissions [--status <status>] [--page <n>] [--limit <n>]`

List each paid invoice: the sale, the BladeCP commission and what you receive.

| Option | Meaning |
| --- | --- |
| `--status <status>` | Only lines with this status: pending, confirmed, cleared, reversed or rejected |
| `--page <n>` | Page to show (starts at 1) |
| `--limit <n>` | How many to show per page (up to 100) |

### `bladecp partner marketplace statements`

List the monthly statements: your earnings netted against your base server.

### `bladecp partner marketplace statement <statement>`

Show one statement and its commission lines.

### `bladecp partner marketplace invoices`

List the open invoices of your base server.

### `bladecp partner webhooks list`

List your webhook endpoints.

### `bladecp partner webhooks show <endpoint>`

Show an endpoint: address, events and status.

### `bladecp partner webhooks create --url <url> --event <type>... [--name <name>]`

Add an endpoint and get its signing secret.

| Option | Meaning |
| --- | --- |
| `--url <url>` | Address that receives the events (https) |
| `--event <type>` | Event type to send (repeat it, or separate with commas) |
| `--name <name>` | A name to tell the endpoint apart (for example Production WHMCS) |

### `bladecp partner webhooks update <endpoint> [--url <url>] [--event <type>...] [--name <name>] [--yes]`

Change the address, events or name of an endpoint.

| Option | Meaning |
| --- | --- |
| `--url <url>` | Address that receives the events (https) |
| `--event <type>` | Event types to send, replacing the current list (repeat it, or separate with commas) |
| `--name <name>` | New name of the endpoint ("" removes it) |
| `-y, --yes` | Do not ask for confirmation |

### `bladecp partner webhooks pause <endpoint> [--yes]`

Stop sending events to an endpoint for now.

| Option | Meaning |
| --- | --- |
| `-y, --yes` | Pause without asking |

### `bladecp partner webhooks resume <endpoint> [--yes]`

Send events to a paused endpoint again.

| Option | Meaning |
| --- | --- |
| `-y, --yes` | Do not ask for confirmation |

### `bladecp partner webhooks delete <endpoint> [--yes]`

Delete an endpoint.

| Option | Meaning |
| --- | --- |
| `-y, --yes` | Delete without asking |

### `bladecp partner webhooks rotate-secret <endpoint> [--yes]`

Replace the signing secret of an endpoint.

| Option | Meaning |
| --- | --- |
| `-y, --yes` | Replace the secret without asking |

### `bladecp partner webhooks deliveries [--endpoint <id>] [--status <status>] [--page <n>] [--limit <n>]`

List what BladeCP sent and what your system answered.

| Option | Meaning |
| --- | --- |
| `--endpoint <id>` | Only the deliveries of this endpoint |
| `--status <status>` | Only deliveries in this state: pending, delivering, succeeded, failed or dead |
| `--page <n>` | Page to show (starts at 1) |
| `--limit <n>` | How many to show per page (up to 100) |

### `bladecp partner webhooks replay <delivery> [--yes]`

Send a delivery again, with the same event ID.

| Option | Meaning |
| --- | --- |
| `-y, --yes` | Do not ask for confirmation |

### `bladecp partner migrations list --installation <id> [--client <id>] [--limit <n>] [--all]`

List the Fast Deploy requests of a WHMCS installation.

| Option | Meaning |
| --- | --- |
| `--installation <id>` | The WHMCS installation that made the request (its BladeCP installation ID, a UUID) |
| `--client <id>` | Only the requests of this client (its ID in WHMCS) |
| `--limit <n>` | How many to show per page (1 to 100, 50 by default) |
| `-a, --all` | Read every page, not only the first one |

### `bladecp partner migrations show <request> --installation <id> --client <id> [--watch]`

Show a request: phase, components, preview and billing.

| Option | Meaning |
| --- | --- |
| `--installation <id>` | The WHMCS installation that made the request (its BladeCP installation ID, a UUID) |
| `--client <id>` | The client of that installation the request belongs to (its client ID in WHMCS) |
| `-w, --watch` | Keep following the request until it needs someone or ends |

### `bladecp partner migrations review <request> --installation <id> --client <id> --domain <host>`

Confirm the domain of the site found in the backup.

| Option | Meaning |
| --- | --- |
| `--installation <id>` | The WHMCS installation that made the request (its BladeCP installation ID, a UUID) |
| `--client <id>` | The client of that installation the request belongs to (its client ID in WHMCS) |
| `--domain <host>` | Domain the migrated site will use |

### `bladecp partner migrations approve <request> --installation <id> --client <id> [--yes]`

Approve the preview so BladeCP finishes the migration.

| Option | Meaning |
| --- | --- |
| `--installation <id>` | The WHMCS installation that made the request (its BladeCP installation ID, a UUID) |
| `--client <id>` | The client of that installation the request belongs to (its client ID in WHMCS) |
| `-y, --yes` | Do not ask for confirmation on a terminal |

### `bladecp partner migrations cancel <request> --installation <id> --client <id> [--reason <text>] [--yes]`

Cancel a request that is not approved yet.

| Option | Meaning |
| --- | --- |
| `--installation <id>` | The WHMCS installation that made the request (its BladeCP installation ID, a UUID) |
| `--client <id>` | The client of that installation the request belongs to (its client ID in WHMCS) |
| `--reason <text>` | Optional note about why you are cancelling |
| `-y, --yes` | Do not ask for confirmation on a terminal |

### `bladecp partner migrations retry <request> --installation <id> --client <id>`

Try a failed migration again, when that is safe.

| Option | Meaning |
| --- | --- |
| `--installation <id>` | The WHMCS installation that made the request (its BladeCP installation ID, a UUID) |
| `--client <id>` | The client of that installation the request belongs to (its client ID in WHMCS) |

### `bladecp partner migrations billing-queue [--limit <n>] [--all]`

List the requests waiting for the billing WHMCS.

| Option | Meaning |
| --- | --- |
| `--limit <n>` | How many to show per page (1 to 100, 50 by default) |
| `-a, --all` | Read every page, not only the first one |

### `bladecp partner migrations billing-link <request> --installation <id> --client <id> --external-id <id> --email <email> --name <name> [--company <name>] [--yes]`

Link a request to its client and service in the billing WHMCS.

| Option | Meaning |
| --- | --- |
| `--installation <id>` | The billing WHMCS that links the request (its BladeCP installation ID) |
| `--client <id>` | The client ID in the billing WHMCS |
| `--external-id <id>` | The service ID in the billing WHMCS |
| `--email <email>` | Email of the client (BladeCP finds or creates the account by it) |
| `--name <name>` | Name of the client: the first word is the first name, the rest the last name |
| `--company <name>` | Company of the client, when there is one |
| `-y, --yes` | Do not ask for confirmation on a terminal |

### `bladecp partner migrations claim-url <request> --installation <id> --client <id>`

Get the address where the account holder confirms the account.

| Option | Meaning |
| --- | --- |
| `--installation <id>` | The WHMCS installation that made the request (its BladeCP installation ID, a UUID) |
| `--client <id>` | The client of that installation the request belongs to (its client ID in WHMCS) |

## Any route

`bladecp api` reaches every Customer API route with the key in use, including
the ones without a command of their own; `bladecp api list` shows every route
and the command that covers it.

### `bladecp api <path> [-X <method>] [--data <json> | --input <file>] [--yes]`

Call any Customer API route with your sign-in.

| Option | Meaning |
| --- | --- |
| `-X, --method <method>` | HTTP method: GET, POST, PUT, PATCH or DELETE |
| `--data <json>` | JSON body of the request |
| `--input <file>` | File with the JSON body ("-" reads stdin) |
| `-y, --yes` | Do not ask before a DELETE on a terminal |

### `bladecp api list`

List every API route and the command that covers it.

## The CLI

### `bladecp update [--check] [--yes]`

Check the latest version on npm, show what changed and update with the package
manager that installed the CLI: `npm install --global`, `pnpm add --global`,
`yarn global add`, `bun add --global` or `volta install`. A copy run with
`npx` (or `pnpm dlx`, `yarn dlx`, `bunx`) has nothing to update; a copy
installed in a project is updated there.

| Option | Effect |
|---|---|
| `--check` | Only check; nothing is installed. With `--json`, returns `current`, `latest`, `updateAvailable`, `install`, `manager` and `command`. |
| `-y`, `--yes` | Update without asking. Needed without a terminal. |

When the package manager cannot write to its folder (`EACCES`), the CLI
explains how to fix it without running it as another user with sudo.

Once a day, in the background, the CLI asks the npm registry for the latest
version (nothing else is sent) and shows one quiet line at the end of an
interactive command. Never with `--json`, in a pipe, in CI or without color.
Turn it off with `BLADECP_NO_UPDATE_CHECK=1`, `NO_UPDATE_NOTIFIER` or
`bladecp config set update-check off`.

### `bladecp config list`, `bladecp config get <key>`, `bladecp config set <key> <value>`

Show or change your preferences, kept in the config folder. `bladecp config`
alone lists them.

| Key | Values | Effect |
|---|---|---|
| `auto-update` | `on` (default), `off` | When a new version is out, update before a command, then run it on the new version. Only on an interactive terminal with a global install; never in CI, in scripts or with `--json`. |
| `update-check` | `on` (default), `off` | The daily check for a new version. |
| `lang` | `auto` (default), `en`, `pt-BR`, `es` | Message language when `--lang` is not given. |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success (for `migrate`, the site is ready for review) |
| 1 | Unexpected error |
| 2 | Invalid usage or input |
| 3 | Not signed in, key not accepted, or sign-in failed |
| 4 | Permission denied |
| 5 | Not found |
| 6 | Rejected by the API (for example, an action not available in the current phase), or a backup that does not migrate as it is (`analyze`) |
| 7 | Rate limited |
| 8 | Network or server error, or upload failure |
| 9 | Migration failed or was cancelled |
| 10 | Waiting for your action (for example, confirm the domain) |
| 11 | Update required: the API no longer accepts this version (`bladecp update`) |
| 130 | Interrupted |

## Environment variables

| Variable | Purpose |
|---|---|
| `BLADECP_API_KEY` | API key to use instead of the saved sign-in |
| `BLADECP_API_URL` | API address (same as `--api-url`) |
| `BLADECP_HUB_URL` | Hub address for the sign-in and links (default: the Hub of the API address) |
| `BLADECP_CONFIG_DIR` | Folder for the saved sign-in, preferences, upload progress and the version check; `~` is expanded |
| `BLADECP_NO_UPDATE_CHECK` | `1` never checks for a new version (`NO_UPDATE_NOTIFIER` also works) |
| `BLADECP_MOTION` | `off` shows the B of the sign-in without animation, `reduced` only its last frame (as over SSH) |
| `NO_COLOR` | Disable colors when set to a non-empty value (`FORCE_COLOR=0` and `TERM=dumb` do the same) |
| `FORCE_COLOR` | Force colors (`1`, `2` or `3` for the depth), also in pipes |
| `CI` | In CI the CLI never asks and never animates |
| `npm_config_registry` | Registry used by the version check (default `https://registry.npmjs.org`) |
| `LC_ALL`, `LC_MESSAGES`, `LANG` | Message language when `--lang` is not given |
