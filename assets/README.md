# Public assets

## Brand mark

`logo-light.svg` is the official BladeCP mark retrieved from
`https://bladecp.com/layout/logo_bladecp.svg`. It is retained as vector paths
only and is intended for light backgrounds.

`logo-dark.svg` is the matching dark-background variant. It differs only in
the root `fill` colour (`#ffffff`); its vector paths and view box match the
official mark.

Both SVG files contain only a root `<svg>` element and path elements. They
contain no scripts, external references, embedded images, event-handler
attributes or metadata. `scripts/check-public-tree.sh` verifies this on every
run.

## README artwork

Each README shows a hero and an architecture diagram in its own language, in a
wide and a compact version: `hero.<language>.svg`,
`hero-compact.<language>.svg`, `architecture.<language>.svg` and
`architecture-compact.<language>.svg`, for `en`, `pt-BR` and `es`. Below 600
pixels, the README switches to the compact version through `<picture>`.

They are static vector files with system fonts, an accessible `<title>` and
`<desc>`, and a CSS animation of the horizon light that stops when the reader
prefers reduced motion. They load no fonts, images or scripts and reference
nothing outside the file. `scripts/check-public-tree.sh` verifies the exact
set, the allowed elements and the absence of external references.

The READMEs also ship in the npm package, so they reference this artwork by
absolute `raw.githubusercontent.com/bladecp/bladecp-cli/main/assets/` URLs,
which work on GitHub and on npmjs.com.
