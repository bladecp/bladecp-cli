# Public release process

This page explains how maintainers prepare and publish the BladeCP CLI. The
process is intentionally conservative: preparing an artifact does not publish
it.

## The three steps

```sh
./scripts/public-release.sh prepare 0.1.0
./scripts/public-release.sh stage-github 0.1.0 --public-base <clean-public-main-checkout>
./scripts/public-release.sh publish 0.1.0 --confirm-publication v0.1.0
```

`prepare` runs the release gates on a closed manifest, builds the npm package
from the curated public tree and creates the reviewed artifact directory.
`stage-github` creates a local Git repository with an independent public
history and the matching version tag. Neither command contacts GitHub or npm.

`publish` is intentionally separate. It requires the exact version
confirmation and an additional maintainer-controlled safety lock. It validates
the staged commit, tag, checksum and approved GitHub destination before it can
perform an external write. It never force-pushes. It does not publish to npm
by itself: it prints the exact `npm publish` command for the verified tarball,
which a maintainer runs with their own npm account.

## What is released

Every public release includes:

- the npm package tarball, `bladecp-cli-<version>.tgz`, built from the public
  tree and containing only `dist/`, the three READMEs, `CHANGELOG.md`,
  `LICENSE` and `package.json`;
- `SHA256SUMS`, so users can verify the downloaded tarball;
- release notes for that version, taken from the changelog;
- a curated public source tree with its documentation, templates and tested
  automation.

The same tarball is attached to the GitHub release and published to npm as
`@bladecp/cli`, so its checksum can be verified against both. See
[installation](installation.md#verify-a-release-download).

## Safety checks

The preparation process checks version consistency between `package.json`,
`CHANGELOG.md` and `reference.json`, then runs lint, type checking, the test
suite and the build, both on the development source and on the exported
public tree. It scans the public tree and the tarball for secret patterns,
personal data and unintended internal references, verifies local links and
the closed list of public files, checks that the tarball contains only the
expected files, and installs that tarball in a disposable prefix to run
`bladecp --version` and `bladecp --help`. It produces an audit record with the
results and the checksum.

Automated checks cannot judge every security or editorial concern. The first
public release and material changes receive an independent human review of
code, documentation, manifest and release assets.

## History policy

The first public release starts a clean, curated public history. Later
releases add ordinary reviewed commits and version tags to that history. The
private development source remains authoritative: private history is never
mirrored or copied into the public repository, and public history is never
rewritten after the first release.

Public contributions are reviewed in GitHub, then incorporated into the
private development source before returning in a later curated public export.
This keeps the public repository reviewable without creating a second source
of truth.

For the contribution path between the public repository and the primary
development source, see [repository governance](repository-governance.md).
