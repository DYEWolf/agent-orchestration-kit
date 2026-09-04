# Bundled skill snapshots

This directory is the source for the catalog-derived skill bundle. Reviewed
upstream snapshots retain complete pinned upstream trees, while the rendered
trees are repository-local Living Fixtures reconciled manually under overlay-v2.
First-party skills retain explicit `agent-orchestration-kit` authorship and
source/render hashes. The catalog, not a hard-coded inventory, determines
generated installation artifacts and discovery wrappers.

`init` must only read package-local snapshots from this directory. It must never
download upstream `latest` content while configuring a user repository.

Maintainers inspect pinned upstream snapshots deliberately with
`npm run upstream:sync`. The sync script checks out the exact pinned commit,
never a floating branch, and validates snapshots without rewriting reviewed
content. `npm run bundle:validate` verifies the reviewed result.
