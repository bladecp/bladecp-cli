# Contributing to the BladeCP CLI

Thanks for taking the time to contribute. This repository contains the
official BladeCP command-line client, published on npm as `@bladecp/cli`.

## How public contributions are handled

GitHub issues and pull requests are reviewed publicly. An approved change
passes the complete project validation and release review before it appears in
a published package.

This means a merged pull request may not appear in a public release
immediately. After the first public release, public commits are added
normally and are never rewritten or force-pushed.

Read [repository governance](docs/repository-governance.md) for the complete
policy.

## Scope

Useful contributions include bug fixes, reliability improvements, clearer
messages, translation fixes, documentation improvements, and focused
enhancements to the existing commands.

Before starting a large feature, open an issue to describe the problem and the
proposed outcome. This helps us confirm scope and avoid duplicate work.

Do not include API keys, customer data, backup files, domains you do not own,
or other sensitive information in issues, pull requests, commits, screenshots,
or test fixtures.

## Development environment

- Node.js 24 for development (see `.nvmrc`). The published package supports
  Node.js 20 or later.
- pnpm 12 (the exact version is in the `packageManager` field of
  `package.json`).

```sh
pnpm install --frozen-lockfile
pnpm build
node dist/bin.js --help
```

## Validation

Run the same checks as the public continuous integration before opening a
pull request:

```sh
pnpm lint          # Biome
pnpm typecheck
pnpm test          # Vitest, against a local simulated API
pnpm build
bash scripts/check-public-tree.sh --package
```

Tests never call a real API: they use the simulated server in
`test/helpers/mock-api.ts`. Keep it that way.

## Project rules

- **Three languages.** English is the base. Every user-facing message exists
  in `src/i18n/en.ts`, `src/i18n/pt-BR.ts` and `src/i18n/es.ts` with the same
  `{placeholders}`. The type checker and `test/i18n.test.ts` block gaps.
- **No em dash in user-facing text.** Messages, READMEs, the changelog and the
  documentation use commas, colons, parentheses or separate sentences instead.
- **Terminal safety.** Text that comes from outside (the API, the network,
  file names) never reaches the terminal unescaped. All human output goes
  through `src/output.ts`; values interpolated in template literals go through
  `safeText`. `test/terminal-safety.test.ts` covers hostile payloads.
- **Keys never appear.** Never write to stdout or stderr outside `Output`, and
  register secrets with `out.addSecret`. `test/redaction.test.ts` covers every
  command.
- **Stable contract.** Exit codes, the `--json` envelope and error `code`
  values are a public contract. Changing them requires a major version. Every
  `code` is listed in `ERROR_CODES` (`src/reference.ts`).
- **Reference up to date.** A change to a command, option, alias, exit code,
  error code or help text runs `pnpm run export:reference` and commits the
  updated `reference.json`. `pnpm test` fails when it is out of date.
- **Fewer steps for the user.** The CLI asks questions only on an interactive
  terminal, never with `--json`, and every question has an equivalent option.
- **Zero runtime dependencies.** The CLI uses native `fetch`, `util.parseArgs`,
  `http(s)` and `readline`. A new runtime dependency needs prior agreement in
  an issue.

## Pull requests

1. Start from the current default branch and create a focused branch.
2. Describe the user-facing problem, the chosen solution, and the validation
   you performed.
3. Add or update tests when behavior changes.
4. Keep unrelated formatting or refactoring out of the pull request.
5. Be ready to address review feedback before merge.

Please write commit messages and pull-request descriptions clearly enough that
reviewers can understand the intended behavior from the public context.

## Security reports

Do not use GitHub issues or pull requests to report a vulnerability. Follow
the private reporting process in [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
