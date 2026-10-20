# Automation and JSON

The CLI is designed to be driven by scripts, CI jobs and agents. Three things
make that reliable: it never asks questions without a terminal, `--json` prints
one predictable document, and exit codes and error codes are stable.

## Non-interactive use

- Sign in with `BLADECP_API_KEY`. Nothing is saved on disk.
- The CLI asks questions only when both stdin and stdout are a terminal,
  `--json` is not set and `CI` is not set. Every question has an equivalent
  option (`--yes` for the confirmations of `approve`, `cancel` and `update`).
- Without a terminal (or in CI) the output is plain text with no colors, no
  animation and no live progress; the help and every human message stay
  readable in logs.
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
colors, progress or questions (`--help --json` included: the help as one
document). Success:

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

Some errors add fields of their own, for example `phase` on `phase_conflict`,
`matches` on `ambiguous_id`, `retryReason` on `retry_unavailable` and
`migrationUuid`, `partnerPlanId` and `locationId` on `migration_in_progress`.
An answer from the API that does not follow its contract (an HTML page with
status 200, a missing field) is `invalid_response` with exit code `1`.

Read commands (`servers list`, `servers show`, `migrations list`,
`migrations status`, `destinations list`) return the API objects unchanged in
`data`; once a migration is complete, `migrations status` adds
`data.domainPointing` (described below), and while a phase is taking longer
than usual it adds `data.slowPhase`:
`{ "phase": "provisioning", "elapsedMs": 2700000, "expectedMs": 600000, "contactSupport": true }`.
Nothing else is changed in the API objects. `whoami` returns `apiUrl`, `source`, `customer`, `keyUuid`, `scopes`,
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
  `nextAction` points to `bladecp migrations status <uuid> --watch`;
  `domainPointing` is there too (`null` until the migration is complete).

`bladecp migrations status <uuid> --watch --json` prints one JSON line per
change instead, each with the same envelope, and ends with exit code `0` once
the migration is complete (`cutover_pending` or `cutover_stalled`: pointing the
domain is optional). It ends with `10` when it is waiting for you, for example
to confirm the domain, and with `9` when the migration failed or was cancelled.
An error while watching is one JSON line as well, so every line parses. When a
phase passes its usual time, one extra line carries `data.slowPhase` (and one
more when it is time to contact support).

## Any route with `bladecp api`

Every command answers `--json`. For a route without a command of its own, use
`bladecp api`: it sends the request with the key in use and prints the answer.
The path must be a Customer API route (`/customer/...`); a body (`--data` or
`--input <file>`, `-` for stdin) makes it a POST unless `-X` says otherwise.
With `--json`, the answer comes inside the envelope.

```sh
bladecp api /customer/me --json
bladecp api -X PATCH /customer/webhook-endpoints/<id> --input endpoint.json --json
bladecp api list --json   # every route, its scopes and the command that covers it
```

A partner command run with a customer key stops with `partner_only` (exit code 4).

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
| 11 | `UPDATE_REQUIRED` | The API no longer accepts this version; run `bladecp update` |
| 130 | `INTERRUPTED` | Interrupted |

## Stability

Exit codes, the `--json` envelope and error `code` values are a public
contract. Changing them requires a new major version; new codes and fields can
be added in any release.

The API can ask for a minimum CLI version: an answer `426`, or a
`BladeCP-Min-CLI-Version` header above the version in use, stops the command
with `update_required` and exit code `11`. Update with
`bladecp update --yes --json` (`npm install --global @bladecp/cli@latest` and
the equivalents of pnpm, yarn and bun). `message` and `hint`
follow the selected language and may change wording in any release.

[`reference.json`](../reference.json) lists every command, option, alias, exit
code and error code with its messages in English, Brazilian Portuguese and
Spanish. Tools can read it instead of parsing help output.

## Retries and limits

The CLI already waits and retries when the API answers `429 Too Many Requests`
(honoring `Retry-After`), when a read fails on the network or with a server
error, and when an upload part fails. On a terminal each retry shows one quiet
line, such as "Trying again in 4 s (2/4)". A command that still
fails ends with exit code `7` (`rate_limited` or `daily_quota_exceeded`) or
`8`. A script can retry exit code `8` later; an interrupted upload continues
where it stopped when the same `bladecp migrate` command runs again.

## Colors and language

Colors are used only on a terminal. `NO_COLOR` (any non-empty value),
`FORCE_COLOR=0` or `TERM=dumb` disable them, and `FORCE_COLOR=1`, `2` or `3`
forces them, also in a pipe. `--json` never has colors. Set `--lang en` (or
`LC_ALL=en`) when a script also stores the human messages. `--debug` describes
each request on stderr and never shows the key.

## The version check

Interactive runs check the npm registry for a new version at most once a day,
in the background, and never in `--json`, pipes, CI or without color. Nothing
but the version number is asked. Turn it off with `BLADECP_NO_UPDATE_CHECK=1`
or `NO_UPDATE_NOTIFIER`. In CI, pin the version you test with
(`npx --yes @bladecp/cli@0.2.0`) and update on purpose.

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
