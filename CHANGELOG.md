# Changelog

All notable changes to the BladeCP CLI are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.3.1] - 2026-10-18

### Fixed

- `bladecp analyze` and the analyzer library read a backup compressed as
  several gzip blocks (members) the same way everywhere. In some browsers and
  Node versions the web entry stopped at the end of the first block and
  reported a cut file. Both entries now share one gzip reader, with no
  `DecompressionStream` and no zlib stream: it reads every block in turn and,
  like the migration, looks at what follows the last block only when the
  backup needs more data, so bytes added after the end of a complete backup no
  longer refuse it, while a damaged block in the middle still does.

## [0.3.0] - 2026-10-17

Know what a cPanel backup holds before you migrate it. The `--json` output,
the exit codes and the error codes of 0.2.0 keep their meaning; this release
only adds to them.

### Added

- `bladecp analyze <backup.tar.gz>` reads a full cPanel backup on your computer
  and shows what it holds (sites, WordPress, databases with engine and version,
  email, DNS, cron, PHP versions, files and size), what comes to BladeCP, what
  stays behind, the notes that matter and the smallest plan it needs (disk and
  databases). It ends with the `bladecp migrate` command ready to run. It needs
  no sign-in and no network: nothing from the backup leaves the computer.
- The analysis reads the backup the same way the migration does, once and as a
  stream (gzip, plain tar, GNU and PAX long names, sparse files), so it never
  loads the file into memory, even at 50 GB. Large files show a progress bar.
  When the migration would refuse the backup (a damaged or cut file, a site
  that is not WordPress, an active WordPress Multisite, a domain or a value of
  `wp-config.php` it does not accept, a backup with no database dump), it says
  why and what to do, and exits with `6`.
- `--prices` (with `--currency`) adds the cheapest plan of your account that
  fits the backup, with the price of now and the `--plan` and `--location` to
  migrate to it. Without a sign-in it explains how to sign in; if the plans do
  not load, the analysis still stands. The only request is the list of plans,
  with the currency.
- `bladecp analyze --json` prints the report in the `bladecp.analyze.v1`
  schema, with `ok: true` even when the backup does not migrate, so scripts
  and agents decide on `verdict`, `blockers` and `warnings`. Passwords, hashes,
  keys, email addresses and the text of `wp-config.php` never appear in the
  report or on the screen.
- The analyzer is also a library in the same package, with no dependencies:
  `@bladecp/cli/analyzer` (the core, for Node and browsers),
  `@bladecp/cli/analyzer/node` (a file path) and `@bladecp/cli/analyzer/web`
  (a `File` or `Blob`, with `DecompressionStream`).
- `reference.json` describes the `analyze` contract: the verdicts with their
  exit codes and every blocker and warning code with its message in the three
  languages.

## [0.2.0] - 2026-10-17

A new look for every screen and a CLI that keeps itself current. The `--json`
output, the exit codes of 0.1.0 and the error codes keep their meaning; this
release only adds to them.

### Added

- A new design for every screen on a terminal, with the identity of the
  BladeCP Hub: a horizon line, a rail of steps, quiet colors, and tables, help
  and progress that fit 40, 80 or 120 columns. Without a terminal the output
  stays the plain text of 0.1.0.
- `bladecp login` shows the BladeCP B in 3D, rendered on the fly: it spins for
  about 1.5 seconds and lands facing you, centered in its area and sized so
  the waiting screen fits the window. While the login waits for the browser,
  single points of light twinkle around it and stop when the login ends. Over
  SSH or with `BLADECP_MOTION=reduced` it shows the last frame still; without
  color it is drawn in ASCII; in CI, with `--json` or in a pipe it does not
  appear. While waiting for the browser, Enter opens it again, `c` copies the
  address and Esc cancels.
- `bladecp` alone on a terminal is a welcome screen: the account, what needs you
  right now and the shortcuts.
- `bladecp migrate` is a guided wizard on a terminal: the destination with the
  arrow keys, a confirmation with the plan, the place and the monthly price, the
  upload with a progress bar, every phase with its time, the preview, and
  approval right there with the key `a` (never with `--yes`).
- A phase that takes longer than usual says so, explains that the migration
  keeps going if you leave and, when it is very long, points to support. With
  `--json`, `migrations status` and `--watch` add a `slowPhase` field.
- `bladecp update` checks npm, shows what changed and updates with the package
  manager that installed the CLI (npm, pnpm, yarn, bun or Volta), with `--check`
  and `--yes`. Permission errors are explained without suggesting sudo.
- Once a day, in the background, the CLI asks the npm registry for the latest
  version and shows one quiet line at the end of interactive commands. Never in
  `--json`, pipes, CI or without color; turn it off with
  `BLADECP_NO_UPDATE_CHECK=1`, `NO_UPDATE_NOTIFIER` or
  `bladecp config set update-check off`. Nothing else is sent.
- `bladecp config list`, `get` and `set` for preferences: `auto-update` (off by
  default; when on, the CLI updates itself before a command on an interactive
  terminal), `update-check` and `lang`.
- When the API answers `426`, or sends `BladeCP-Min-CLI-Version` above the
  version in use, the CLI stops with `update_required` and the new exit code
  `11`.
- Short IDs: any command that takes a server or migration ID accepts its first
  characters (at least 4) when only one of yours starts with them.
- `bladecp servers --all`; deleted servers are hidden by default (`--json`
  still lists every server).
- `approve` and `cancel` ask for confirmation on a terminal; `--yes` skips it.
- `--debug` (or `--verbose`) describes each request on stderr, never the key.
- `--help --json` returns the help as one JSON document; `bladecp migrations
  --help` shows the whole group.
- Retries of a request show one quiet line, such as "Trying again in 4 s (2/5)".
- New error codes: `invalid_response`, `filesystem_error`, `ambiguous_id`,
  `migration_in_progress`, `confirmation_required`, `update_failed`,
  `update_required`, and `migration_failed` and `migration_cancelled` are now in
  `reference.json`.

### Fixed

- `servers` shows the domain when the API sends `primaryDomain`.
- An answer outside the contract (missing fields, an empty `data`, an HTML page
  with status 200) is reported as `invalid_response`, never as a JavaScript
  error or "HTTP 200".
- `migrations status --watch --json` keeps one JSON document per line, errors
  included.
- Running `migrate` again with another `--plan` or `--location` no longer
  continues the earlier migration silently: it asks on a terminal and refuses
  elsewhere, showing the destination in progress.
- A failed migration always shows a reason, and says why a new attempt is not
  available.
- Clear messages for `--json=true`, `--plan -1` and an empty `--api-url`; a
  callback with the wrong `state` no longer cancels the sign-in; `--no-wait
  --json` includes `domainPointing`; a phase conflict names the phase in words.
- Components of a failed or cancelled migration are "not run" instead of
  "waiting", and components the backup does not have are "none in the backup".
- "Backup received" is shown once, the plural of one part is right, and the
  Portuguese texts read better.
- `BLADECP_CONFIG_DIR` expands `~`; `NO_COLOR` follows no-color.org (an empty
  value keeps colors) and `FORCE_COLOR` forces colors in pipes; `CI` never asks.
- File system errors (permissions, a full disk) are explained in words.
- Saving a sign-in over another account or API address says so.

## [0.1.0] - 2026-10-17

First public release.

### Added

- `bladecp login` with the browser (one-time code, PKCE S256, local callback on `127.0.0.1`), with
  `--no-browser`, with `--token <key>` (or `--token -` from stdin) and with `BLADECP_API_KEY`.
- `bladecp logout` and `bladecp whoami`.
- `bladecp servers list` and `bladecp servers show <uuid>` with resource usage.
- `bladecp destinations list` with disk size and monthly prices, and `--currency <code>` to narrow them.
- `bladecp migrate <backup.tar.gz>`: local checks, destination choice, parallel part upload with retries,
  resume by running the same command again, domain confirmation and preview link.
- `bladecp migrations list`, `status [--watch]`, `review`, `approve`, `cancel` and `retry`.
- Without a terminal, `bladecp migrate` never chooses the destination: it needs `--plan` and `--location`, or
  `--yes` when the account has exactly one destination.
- Key problems (expired key, missing permission, too many active keys) point to the API keys page in the Hub.
- Once the domain of a migration is confirmed, `bladecp migrate` and `bladecp migrations status --watch` keep
  waiting for BladeCP to continue instead of asking for the domain again (exit code 10 only while it is still
  unanswered). A domain given with `--domain` at creation is never sent again.
- Text from the API, the network or file names is shown with control characters (C0, DEL, C1, escape
  sequences and bidirectional overrides) escaped visibly, so it cannot inject terminal sequences.
- `--json` output with a stable envelope, documented exit codes, and messages in English, Brazilian
  Portuguese and Spanish.
- A migration is complete once its preview is approved: `bladecp migrations status --watch` and
  `bladecp migrate` end with exit code 0 at `cutover_pending` and `cutover_stalled` (never 9). Pointing the
  domain is optional; the CLI shows the BladeCP nameservers and, when the API returns it, the address for an A
  record, and the `--json` output of `migrate` and `migrations status` adds `data.domainPointing`.

[Unreleased]: https://github.com/bladecp/bladecp-cli/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/bladecp/bladecp-cli/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/bladecp/bladecp-cli/releases/tag/v0.1.0
