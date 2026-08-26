# Approved product specification

Status: approved planning handoff, revision 2, canonical identity `orca-kit`.

The authoritative product plan is the revision approved on 2026-08-25. Its
project identity is globally defined as:

- repository: `DYEWolf/orca-kit`;
- npm package: `@dyewolf/orca-kit`;
- executable: `orca-kit`;
- generated metadata directory: `.orca-kit/`;
- managed markers and generated attribution use `orca-kit`.

## V1 contract

V1 configures an existing Git repository with a GitHub remote for an Orca-based
coordinator/worker workflow. It installs a pinned and attributed local skill
bundle, project instructions, harness adapters, and required GitHub labels. It
provides `init`, `doctor`, and `diff`; it does not manage the installation after
setup.

Orca is the runtime source of truth. GitHub Issues are the only durable tracker.
External software and credentials remain owned by the user. Every mutation is
enumerated in a deterministic ChangePlan, local writes are atomic and
recoverable, remote/global mutations require confirmation, and drift is never
silently overwritten.

## Approved implementation order

Phase 0 establishes package identity, legal/community policy, and this decision
record. Phase 1 implements strict TypeScript/ESM scaffolding, schema and routing
profiles, repository inspection, desired-state rendering, deterministic planning,
in-memory filesystem support, and read-only `codex-only` dry runs. Later phases
add safe application, bundled skill content, Claude wrappers, external
integrations, and release automation.

## Deferred to V2

Updates, reconfiguration, ejection, schema migrations, a Markdown tracker,
custom workers/coordinators, and additional trackers are intentionally excluded.

The complete approved plan remains the acceptance authority; this file records
its repository-local identity and implementation constraints without changing
its scope.
