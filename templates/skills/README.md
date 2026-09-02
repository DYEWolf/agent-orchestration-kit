# Bundled skill snapshots

This directory is the source for the catalog-derived skill bundle. Reviewed
upstream bodies retain structural Orca overlays, maintainer-side patches, full
MIT attribution, and exact provenance; first-party skills retain explicit
`orca-kit` authorship and source/render hashes. The catalog, not a hard-coded
inventory, determines generated installation artifacts and discovery wrappers.

`init` must only read package-local snapshots from this directory. It must never
download upstream `latest` content while configuring a user repository.

Maintainers regenerate upstream snapshots deliberately with `npm run upstream:sync`.
The sync script checks out the exact pinned commit, never a floating branch,
preserves first-party entries, and rejects upstream/first-party name collisions.
`npm run bundle:validate` verifies the reviewed result.
