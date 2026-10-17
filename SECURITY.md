# Security Policy

## Supported versions

Security fixes are evaluated for the latest public release of the BladeCP CLI,
published on npm as [`@bladecp/cli`](https://www.npmjs.com/package/@bladecp/cli).
A fix ships as a new version; keep the CLI on the latest one:

```sh
npm install -g @bladecp/cli@latest
```

## Reporting a vulnerability

Please report suspected vulnerabilities privately by email:

<dev@bladecp.com>

Include enough information for us to reproduce and assess the issue, such as:

- A clear description of the impact.
- The CLI version (`bladecp --version`), the Node.js version (`node --version`)
  and the operating system.
- The command you ran and the smallest reproduction you can share.
- Any relevant output, with API keys, customer information, backup file names
  and other sensitive data removed.

Do not open a public GitHub issue, publish exploit details, or share a proof of
concept that could expose users while the issue is being assessed.

## If a key may have been exposed

API keys start with `bcp_live_`. If a key appeared in a log, a screenshot, a
shell history or a report, revoke it at
<https://hub.bladecp.com/account/api-keys> and sign in again with
`bladecp login`. Running `bladecp logout` only removes the key from the
computer; it does not revoke it.

## What happens next

We will acknowledge the report, assess its impact, and coordinate an
appropriate fix and disclosure. We do not publish a fixed response-time
commitment. Please allow time for investigation and, where needed, for users
to update safely.

## Scope

This policy covers the BladeCP CLI distributed from
[`bladecp/bladecp-cli`](https://github.com/bladecp/bladecp-cli) and the
`@bladecp/cli` package on npm. Areas of particular interest:

- handling of API keys (storage, redaction from output, errors and upload
  progress files);
- the browser sign-in (PKCE, `state`, the local callback on `127.0.0.1`);
- terminal safety when showing text received from the API, the network or file
  names;
- the multipart backup upload and its resume state.

For issues in third-party software, including Node.js or npm themselves, please
contact the relevant project as well.
