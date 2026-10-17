# Command reference

```text
bladecp <command> [options]
```

Run `bladecp --help`, `bladecp <command> --help` or `bladecp help <command>`
for the same information in the terminal. A machine-readable version of this
reference (commands, options, aliases, exit codes and error codes, in the three
languages) is kept in [`reference.json`](../reference.json).

## Global options

| Option | Effect |
|---|---|
| `--json` | Print machine-readable JSON (no colors, no prompts). See [automation and JSON](automation.md). |
| `--api-url <url>` | API address. Default `https://api.bladecp.com`, or `BLADECP_API_URL`. |
| `--lang <en\|pt-BR\|es>` | Language for messages. By default it comes from `LC_ALL`, `LC_MESSAGES` or `LANG`. |
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
you revoke it in the Hub.

### `bladecp whoami`

Show the account and key in use: account ID and email, key ID and where it
comes from (saved sign-in or `BLADECP_API_KEY`), scopes, rate limit, expiry and
API address.

## Servers

### `bladecp servers list`

List your servers. `bladecp servers` does the same.

### `bladecp servers show <uuid>`

Show a server and its resource usage.

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
| `-y`, `--yes` | Do not ask for confirmation; accept the domain found in the backup and, when your account has exactly one destination, that destination. |
| `--no-wait` | Stop after the backup is received instead of following the migration. |

What happens:

1. The file is checked locally: it is a regular file, is not empty, is not
   larger than 50 GB and starts with the gzip signature of a `.tar.gz` backup.
2. A migration is created at the destination you chose. On an interactive
   terminal the CLI asks only what it cannot find out by itself. Without a
   terminal it never chooses the destination: pass `--plan` and `--location`,
   or `--yes` when your account has exactly one destination.
3. The backup is uploaded in parts, three at a time. A part that fails is
   retried with a growing wait.
4. BladeCP confirms the backup and the CLI follows the migration phases.
5. If BladeCP needs the domain confirmed, the CLI asks for it once (press
   Enter to accept the domain found in the backup).
6. When the site is ready, the CLI prints the preview address and the command
   to approve it. The exit code is `0`.

An interrupted upload continues where it stopped when you run the same command
again with the same file. Ctrl+C while the migration is being followed only
stops watching; the migration continues.

### `bladecp migrations list`

List your migrations. `bladecp migrations` does the same.

### `bladecp migrations status <uuid> [--watch]`

Show a migration. With `-w` or `--watch`, keep following it until it needs you
or finishes. A migration is complete once its preview is approved; pointing the
domain is optional, and the CLI shows the BladeCP nameservers and, when the API
returns it, the address for an A record.

### `bladecp migrations review <uuid> --domain <host>`

Confirm which domain a migration uses.

### `bladecp migrations approve <uuid>`

Approve a migration after checking the preview.

### `bladecp migrations cancel <uuid> [--reason <text>]`

Cancel a migration. `--reason` adds an optional note about why.

### `bladecp migrations retry <uuid>`

Try a failed migration again.

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
| 130 | Interrupted |

## Environment variables

| Variable | Purpose |
|---|---|
| `BLADECP_API_KEY` | API key to use instead of the saved sign-in |
| `BLADECP_API_URL` | API address (same as `--api-url`) |
| `BLADECP_CONFIG_DIR` | Folder for the saved sign-in and upload progress |
| `NO_COLOR` | Disable colors (`FORCE_COLOR=0` and `TERM=dumb` do the same) |
| `LC_ALL`, `LC_MESSAGES`, `LANG` | Message language when `--lang` is not given |
