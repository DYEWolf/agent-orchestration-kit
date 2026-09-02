# Phase 2 — safe local application

Status: implemented.

## Scope

Phase 2 turns the deterministic Phase 1 ChangePlan into an atomic local
installation for the `codex-only` profile. It does not mutate global Orca state
or GitHub, and it does not generate Claude compatibility artifacts.

## Installed contract

- Managed block in `AGENTS.md`, preserving every byte outside the markers.
- `.agent-orchestration-kit/config.yaml` and `.agent-orchestration-kit/manifest.json`.
- Four documents under `docs/agents/`.
- Complete MIT attribution under `.agents/THIRD_PARTY_NOTICES.md`.
- A catalog-derived mixed-origin skill bundle under `.agents/skills/`, including
  pinned upstream skills plus first-party `campaign`, support files, Codex
  `agents/openai.yaml`, and per-skill `PROVENANCE.json`.

The bundle is pinned to Matt Pocock's skills repository at commit
`6654f6b60cd9d5be8b54c6fafe44346dabeb3b76`, with Orca overlay version 1.
`ask-matt` is patched to route only to the installed vocabulary.
Campaign is explicitly authored by agent-orchestration-kit, is excluded from third-party
notices, and never claims Matt Pocock provenance.

## Transaction invariant

Every path is validated lexically and against real filesystem ancestors before
writing. New content is written to a same-directory temporary file. Existing
targets move to same-directory backups before the temporary is renamed into
place. Verification runs before backups are removed.

If a required write or verification fails, the transaction restores replaced
files, removes created files, and removes directories created by the operation.
No remote or global action participates in this transaction.

## Commands

```bash
agent-orchestration-kit init [path] --profile codex-only --dry-run
agent-orchestration-kit init [path] --profile codex-only [--yes]
agent-orchestration-kit doctor [path] [--json]
agent-orchestration-kit diff [path] [--json]
```

`init` always computes the ChangePlan first. It refuses collisions, malformed
markers, foreign versions, unsafe paths, and local drift. `--json` requires
`--yes` for a mutating init. A second clean init is a verified no-op.

`doctor` covers the local repository, config, expected manifest contract,
managed block, all skills, attribution, drift, and structural routing. External
Orca, GitHub, and Claude checks are explicit `SKIP` results until their phases.

## Exit gate

- Planning writes nothing.
- First init installs the complete local contract.
- Second init writes nothing.
- User content outside the AGENTS block remains byte-identical.
- Drift and collisions are reported and never overwritten.
- Injected transaction and verification failures restore the pre-operation state.
- Bundle names, hashes, patches, provenance, and MIT license validate locally.
- Packed CLI lifecycle succeeds in a fresh temporary Git repository.
