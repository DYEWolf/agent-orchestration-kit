# Bundled skill snapshots

This directory contains reviewed upstream bodies, structural Orca overlays,
maintainer-side patches, full MIT attribution, and machine-readable provenance
for the seventeen standard skills declared in
`src/adapters/skill-sources/skill-source.ts`.

`init` must only read package-local snapshots from this directory. It must never
download upstream `latest` content while configuring a user repository.

Maintainers regenerate snapshots deliberately with `npm run upstream:sync`.
The sync script checks out the exact commit recorded in source, never a floating
branch, and `npm run bundle:validate` verifies the reviewed result.
