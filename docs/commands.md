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

**Short IDs.** Every command that takes a server or migration `<uuid>` also
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
| `auto-update` | `on`, `off` (default) | When a new version is out, update before a command, then run it on the new version. Only on an interactive terminal; never in CI or with `--json`. |
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
| 6 | Rejected by the API (for example, an action not available in the current phase) |
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
