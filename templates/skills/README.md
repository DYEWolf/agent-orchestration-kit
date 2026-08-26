# Bundled skill snapshots

Phase 2 will populate this directory with the reviewed upstream bodies, structural
Orca overlays, maintainer-side patches, full MIT attribution, and machine-readable
provenance for the seventeen standard skills declared in
`src/adapters/skill-sources/skill-source.ts`.

`init` must only read package-local snapshots from this directory. It must never
download upstream `latest` content while configuring a user repository.
