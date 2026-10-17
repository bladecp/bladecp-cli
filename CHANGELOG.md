# Changelog

All notable changes to the BladeCP CLI are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/bladecp/bladecp-cli/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/bladecp/bladecp-cli/releases/tag/v0.1.0
