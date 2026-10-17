# Installation

## Requirements

- Node.js 20 or later.
- macOS, Linux or Windows.
- Outbound HTTPS access to `api.bladecp.com` (and to `hub.bladecp.com` in your
  browser for the browser sign-in).

The package has no runtime dependencies.

## Install from npm

Install the `bladecp` command globally:

```sh
npm install -g @bladecp/cli
bladecp --version
```

Or run it without installing:

```sh
npx @bladecp/cli login
npx @bladecp/cli servers list
```

Any npm-compatible package manager works too, for example
`pnpm add -g @bladecp/cli`.

## First steps

```sh
bladecp login          # opens your browser to authorize the CLI
bladecp whoami         # shows the account and key in use
bladecp servers list   # lists your servers
```

Continue with [authentication](authentication.md) and the
[command reference](commands.md).

## Update

```sh
npm install -g @bladecp/cli@latest
```

Your saved sign-in and the progress of interrupted uploads are kept across
updates.

## Uninstall

```sh
bladecp logout                 # removes the saved key from this computer
npm uninstall -g @bladecp/cli
```

`bladecp logout` does not revoke the key. Revoke it at
<https://hub.bladecp.com/account/api-keys> if you no longer need it.

The CLI keeps its files in one folder:

| System | Folder |
|---|---|
| macOS and Linux | `$XDG_CONFIG_HOME/bladecp`, by default `~/.config/bladecp` |
| Windows | `%APPDATA%\bladecp` |
| Any, when set | `BLADECP_CONFIG_DIR` |

It contains `config.json` (the saved sign-in) and `uploads/` (the progress of
interrupted uploads). You can delete the folder after uninstalling.

## Verify a release download

Every GitHub release of
[`bladecp/bladecp-cli`](https://github.com/bladecp/bladecp-cli/releases)
attaches the npm package tarball (`bladecp-cli-<version>.tgz`), a
`SHA256SUMS` file and the release notes. The tarball is the same file that is
published to npm.

```sh
shasum -a 256 -c SHA256SUMS      # macOS
sha256sum -c SHA256SUMS          # Linux
npm install -g ./bladecp-cli-0.1.0.tgz
```

To compare it with the npm registry, check that the SHA-1 of the tarball
(`shasum bladecp-cli-0.1.0.tgz`) equals the output of
`npm view @bladecp/cli@0.1.0 dist.shasum`.

## Build from source

```sh
git clone https://github.com/bladecp/bladecp-cli.git
cd bladecp-cli
pnpm install --frozen-lockfile
pnpm build
node dist/bin.js --help
```

Development uses Node.js 24 (see `.nvmrc`) and the pnpm version in the
`packageManager` field of `package.json`. See [CONTRIBUTING.md](../CONTRIBUTING.md).
