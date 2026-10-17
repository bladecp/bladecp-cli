# Automation and JSON

The CLI is designed to be driven by scripts, CI jobs and agents. Three things
make that reliable: it never asks questions without a terminal, `--json` prints
one predictable document, and exit codes and error codes are stable.

## Non-interactive use

- Sign in with `BLADECP_API_KEY`. Nothing is saved on disk.
- The CLI asks questions only when both stdin and stdout are a terminal and
  `--json` is not set. Every question has an equivalent option.
- Without a terminal, `bladecp migrate` never chooses the destination: pass
  `--plan` and `--location` (from `bladecp destinations list`), or `--yes`
  when your account has exactly one destination. Otherwise it stops with
  exit code `2` and the error code `destination_required`.
- `--yes` also accepts the domain found in the backup. Pass `--domain` to set
  it explicitly.

A fully non-interactive migration:

```sh
BLADECP_API_KEY=... bladecp migrate site.tar.gz \
  --plan 12 --location 3 --domain example.com --json
```

## The JSON envelope

With `--json`, every command prints exactly one JSON document on stdout, without
colors, progress or questions. Success:

```json
{ "ok": true, "data": { "...": "..." } }
```

Failure:

```json
{ "ok": false, "error": { "code": "not_found", "message": "Not found. Check the ID and that it belongs to your account.", "exitCode": 5, "status": 404 } }
```

| Field | Meaning |
|---|---|
| `error.code` | Stable error code. Use it in scripts. |
| `error.message` | Human message in the selected language. Do not parse it. |
| `error.exitCode` | The process exit code. |
| `error.status` | HTTP status, when the error came from the API. |
| `error.apiCode` | The API's own error code, when it sent one. |
| `error.hint` | A suggested next step, when there is one. |

Read commands (`servers list`, `servers show`, `migrations list`,
`migrations status`, `destinations list`) return the API objects unchanged in
`data`; once a migration is complete, `migrations status` adds
`data.domainPointing` (described below). `whoami` returns `apiUrl`, `source`, `customer`, `keyUuid`, `scopes`,
`tier`, `rateLimit` and `expiresAt`. The key itself is never included.

## Migrations in JSON

`bladecp migrate --json` prints one document when it stops:

```json
{ "ok": true, "data": { "migrationUuid": "...", "phase": "awaiting_approval", "primaryDomain": "example.com", "previewUrl": "https://...", "resumed": false, "file": { "name": "site.tar.gz", "sizeBytes": 1048576 }, "nextAction": { "type": "approve", "command": "bladecp migrations approve ..." }, "domainPointing": null } }
```

- `nextAction` says what to run next, or is `null` when nothing is left.
- `domainPointing` is `null` until the migration is complete. Once it is
  complete it is `{ "optional": true, "nameservers": [...], "aRecord": "..." }`
  (`aRecord` is the address for an A record, or `null`).
- If the migration fails or is cancelled, `ok` is `false`, `error.code` is
  `migration_failed` or `migration_cancelled`, the exit code is `9`, and
  `data` still describes the migration.
- With `--no-wait`, the document is printed once the backup is received and
  `nextAction` points to `bladecp migrations status <uuid> --watch`.

`bladecp migrations status <uuid> --watch --json` prints one JSON line per
change instead, each with the same envelope, and ends with exit code `0` once
the migration is complete (`cutover_pending` or `cutover_stalled`: pointing the
domain is optional). It ends with `10` when it is waiting for you, for example
to confirm the domain, and with `9` when the migration failed or was cancelled.

## Exit codes

| Code | Name | Meaning |
|---|---|---|
| 0 | `OK` | Success (for `migrate`, the site is ready for review) |
| 1 | `GENERAL` | Unexpected error |
| 2 | `USAGE` | Invalid usage or input |
| 3 | `AUTH` | Not signed in, key not accepted, or sign-in failed |
| 4 | `FORBIDDEN` | Permission denied |
| 5 | `NOT_FOUND` | Not found |
| 6 | `REJECTED` | Rejected by the API |
| 7 | `RATE_LIMITED` | Rate limited |
| 8 | `NETWORK` | Network or server error, or upload failure |
| 9 | `MIGRATION_FAILED` | Migration failed or was cancelled |
| 10 | `ACTION_REQUIRED` | Waiting for your action |
| 130 | `INTERRUPTED` | Interrupted |

## Stability

Exit codes, the `--json` envelope and error `code` values are a public
contract. Changing them requires a new major version. `message` and `hint`
follow the selected language and may change wording in any release.

[`reference.json`](../reference.json) lists every command, option, alias, exit
code and error code with its messages in English, Brazilian Portuguese and
Spanish. Tools can read it instead of parsing help output.

## Retries and limits

The CLI already waits and retries when the API answers `429 Too Many Requests`
(honoring `Retry-After`) and when an upload part fails. A command that still
fails ends with exit code `7` (`rate_limited` or `daily_quota_exceeded`) or
`8`. A script can retry exit code `8` later; an interrupted upload continues
where it stopped when the same `bladecp migrate` command runs again.

## Colors and language

Colors are used only on a terminal. `NO_COLOR`, `FORCE_COLOR=0` or `TERM=dumb`
disable them; `--json` never has colors. Set `--lang en` (or `LC_ALL=en`) when
a script also stores the human messages.

## Example: GitHub Actions

```yaml
- name: Migrate the site
  env:
    BLADECP_API_KEY: ${{ secrets.BLADECP_API_KEY }}
  run: |
    npx --yes @bladecp/cli migrate site.tar.gz \
      --plan 12 --location 3 --domain example.com --json > migration.json
```

Keep the key in a secret store, never in the repository or the command line.
