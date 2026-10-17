## Summary

Explain the purpose of this change and the behavior it adds, changes, or fixes.

## Validation

Describe the checks performed and their results (`pnpm lint`, `pnpm typecheck`,
`pnpm test`, `pnpm build`, `bash scripts/check-public-tree.sh --package`).

## Compatibility

State whether this change affects exit codes, the `--json` envelope, error
codes, options or supported Node.js versions. If a command, option or message
changed, confirm that `reference.json` was regenerated with
`pnpm run export:reference`.

## Messages

Confirm that new or changed messages exist in English, Brazilian Portuguese and
Spanish.

## Security and privacy

Confirm that the change does not expose API keys, customer data, or other
sensitive information, and that text from the API or the network still reaches
the terminal escaped.
