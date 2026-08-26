# `@dyewolf/orca-kit` — approved product and implementation specification

Status: approved planning handoff, revision 2. This repository-local document is
the complete acceptance authority. The original provisional name
`orca-workflow` is replaced everywhere by `orca-kit`.

## 1. Executive summary

Build a public MIT-licensed npm CLI that configures an existing GitHub repository
with an opinionated AI engineering workflow built around Orca, one coordinator,
bounded workers, a pinned Orca-adapted Matt Pocock skill bundle, GitHub Issues,
deterministic verification, explicit decision gates, risk-based review, and safe
worktrees.

The primary command is:

```bash
npx @dyewolf/orca-kit@latest init
```

The CLI configures a repository. It does not install or authenticate Orca,
Codex, Claude, models, accounts, subscriptions, or credentials. V1 owns setup,
not later maintenance of generated files.

## 2. Product principles

1. Orca owns Runs, Tasks, Dispatches, mailboxes, gates, workers, and lifecycle.
2. One coordinator owns the user conversation; workers perform bounded work and
   never create nested workers.
3. One GitHub implementation Issue owns one Orca execution Run, possibly with
   several Tasks.
4. Skills define procedures; project instructions define invariants.
5. Routing is resolved at runtime and is not embedded in long-lived Issues.
6. Installation is non-destructive and never leaves a half-configured repository.
7. Reviewed skill snapshots ship in the npm tarball; init never fetches upstream.
8. External software and authentication belong to the user.
9. Skills, instructions, wrappers, notices, and labels form one installed contract.
10. V1 owns setup only; lifecycle management is deferred.

## 3. Goals

- Configure any existing Git repository that has a GitHub remote.
- Offer interactive setup and automation-friendly flags.
- Live-support `codex-only` and `claude-coordinator`.
- Render `claude-only` and `codex-coordinator`, with promotion gated by the
  Claude-worker smoke test.
- Install the complete approved skill bundle with Orca overlays.
- Create required GitHub labels only after explicit confirmation.
- Provide actionable `doctor` and read-only `diff` reports.
- Preserve complete attribution and license notices.
- Support macOS, Windows, and Linux on Node.js 22 or newer.

## 4. V1 non-goals

V1 does not install external tools, authenticate accounts, manage secrets, use a
tracker other than GitHub Issues, update/reconfigure/eject installations,
three-way merge user edits, support custom workers/coordinators, create an
application, use a runtime other than Orca, create Issues during init, or
commit, push, branch, or open pull requests. It does not localize generated
English artifacts or automatically follow every upstream skill commit.

## 5. User-facing workflow

New work normally progresses through:

```text
wayfinder, when direction is unclear
  -> grill-with-docs
  -> understanding approval
  -> to-spec
  -> specification approval
  -> to-tickets
  -> ticket-breakdown approval
  -> GitHub implementation Issues
  -> implement
  -> deterministic verification and risk-based review
  -> close Issue
```

No phase silently invokes the next. An initial request may authorize the entire
flow, but the coordinator still pauses at the understanding, specification, and
ticket-breakdown gates. Implementation starts only from a claimed, approved,
executable, unblocked implementation Issue.

Each Issue maps to exactly one issue-owned Run. Evidence, implementation,
verification, correction, and review are Tasks within that Run. Cross-Issue
dependencies live in GitHub; intra-Issue dependencies live in Orca.

The CLI writes only confirmed labels during init. At runtime, skills may use
authenticated `gh` to manage Issues, comments, and labels within their contract.

## 6. External prerequisites and ownership

The user supplies Git with a GitHub remote, Node.js 22+, npm/npx, Orca runtime
and CLI, Codex CLI, Claude Code when selected, and authenticated `gh` for the
repository host. The CLI verifies availability, versions, readiness,
authentication, and profile compatibility but never handles credentials.

With confirmation, init may install the official global Orca orchestration
skill, register the repository with Orca, and create missing GitHub workflow
labels. Independent flags disable each class of global or remote mutation.

## 7. Routing profiles

Models are versioned defaults in the profile catalog, editable in project
configuration and rendered into the managed AGENTS constitution. Skills refer
to neutral roles, never provider or model names.

### 7.1 `codex-only` — stable

| Role | Harness/model |
| --- | --- |
| Coordinator | Codex `gpt-5.6-sol`, high |
| Explorer | Codex `gpt-5.6-luna`, high |
| Implementer | Codex `gpt-5.6-luna`, xhigh |
| Difficult implementer | Codex `gpt-5.6-luna`, max |
| Judgment/debugging | Codex `gpt-5.6-terra`, high |
| Architect | Codex `gpt-5.6-sol`, xhigh |
| Fresh high-risk reviewer | Codex `gpt-5.6-sol`, high |

### 7.2 `claude-coordinator` — stable

Claude `opus` coordinates and provides architectural escalation. Explorer,
implementer, difficult implementer, judgment, and reviewer use the same Codex
routes as `codex-only`.

### 7.3 `claude-only` — pending live validation

Claude `opus` coordinates, handles difficult/judgment/architecture work, and
provides fresh review. Claude `sonnet` explores and implements.

### 7.4 `codex-coordinator` — pending live validation

Codex Sol coordinates and provides architectural escalation. Claude `sonnet`
explores and implements; Claude `opus` handles difficult/judgment work and fresh
review.

### 7.5 Stability gate

Profiles become stable only after a live Orca Run smoke test. Claude as an Orca
worker must demonstrate Dispatch receipt, bounded work, exactly one
`worker_done`, and no nested creation before the two Claude-worker profiles are
promoted. Pending profiles remain selectable with a visible warning.

### 7.6 Shared execution policy

Escalation is bounded worker → judgment worker → architectural authority, only
when needed. At most three implementation workers are active by default.
Parallel Tasks require independent, non-overlapping ownership. Independent
review is risk-based. Reviewers report `SHIP`, `FIX_FIRST`, or `RETHINK` and do
not implement corrections. Workers create no Runs, Tasks, worktrees, or agents.

## 8. GitHub tracker contract

GitHub Issues is mandatory. Init fails early without a GitHub remote or valid
`gh` authentication for that host, and never creates Issues. The only label
required by the installed workflow is:

```text
ready-for-agent
```

It marks an approved, executable, unblocked implementation Issue whose contract,
acceptance criteria, and verification are complete. Its absence is a doctor
`FAIL`. Wayfinder uses `Type: wayfinder-map` on maps and
`Type: wayfinder-<research|prototype|grilling|task>` plus `Part of: #<map>` on
children; it does not create or depend on `wayfinder:*` labels. Native
sub-Issues, dependencies, and assignees are canonical for hierarchy, blocking,
and ownership. When unavailable, a map task list and `Blocked by: #<issue>` are
the respective fallbacks. `Type: wayfinder-task` is planning metadata and never
implies `ready-for-agent` or an Issue-owned execution Run.

## 9. Installed skill bundle

The standard bundle contains exactly these user-facing skills:

- `ask-matt`
- `grill-with-docs`
- `to-spec`
- `to-tickets`
- `implement`
- `wayfinder`
- `improve-codebase-architecture`
- `handoff`

It also contains these reusable procedures:

- `grilling`
- `domain-modeling`
- `research`
- `prototype`
- `tdd`
- `diagnosing-bugs`
- `codebase-design`
- `code-review`
- `resolving-merge-conflicts`

`setup-matt-pocock-skills` and unrelated upstream skills are excluded.
`ask-matt` may route only to installed skills.

## 10. Skill packaging and multi-harness rendering

Every release carries reviewed snapshots with upstream repository/path, exact
commit, original hash, overlay version, rendered hash, and full MIT attribution.
Init is offline for skill contents. Maintainers alone run upstream sync.

Each rendered SKILL.md consists of CLI-owned frontmatter, a structural Orca
section, and the pinned upstream body. Necessary body changes are recorded as
maintainer-side patches so sync can detect conflicts. Bodies use neutral roles.

Canonical content installs at `.agents/skills/`. Codex discovery uses supported
`agents/openai.yaml`. Claude profiles additionally render `CLAUDE.md` and
`.claude/skills/<skill>/SKILL.md` wrappers without symlinks. Phase 3 must first
test whether referenced canonical bodies are reliably loaded; otherwise wrappers
inline the full content and both hashes are recorded. Existing non-managed
Claude skill directories are collisions, never overwritten.

## 11. Generated project structure

```text
AGENTS.md                         managed block only
.orca-kit/config.yaml            generator input
.orca-kit/manifest.json          CLI/bundle versions and per-file hashes
.agents/THIRD_PARTY_NOTICES.md
.agents/skills/<skill>/...
docs/agents/orca-execution.md
docs/agents/issue-tracker.md
docs/agents/skill-overrides.md
docs/agents/domain.md
CLAUDE.md                         Claude profiles only
.claude/skills/                  Claude profiles only
```

## 12. Configuration schema

Schema version 1 records the selected profile, Orca runtime, English language,
GitHub tracker, per-role harness/model/resolution/optional effort, fresh reviewer
session, execution concurrency/review/worktree policies, and global/GitHub
mutation confirmation policies. Exact model identifiers and provider aliases
are distinguished. Zod validates configuration. V1 ships no migrations.

## 13. Managed content and re-running init

The CLI owns only this AGENTS block:

```markdown
<!-- orca-kit:start version="1" -->
Generated orchestration constitution...
<!-- orca-kit:end -->
```

Everything outside it is preserved byte-for-byte. Fully generated files state
their origin and V1 no-update policy; manifest hashes record ownership.

- No installation: install the complete contract.
- Same CLI version with no drift: verified no-op.
- Same version with drift: list drift and refuse overwrite; there is no force.
- Different version: stop because V1 does not update.

## 14. ChangePlan and atomic application

Every mutation starts with a deterministic ChangePlan listing creates, managed
updates, collisions/drift, offered global commands, offered label mutations,
validations, and rollback actions. Dry-run renders it without writes. JSON is a
stable machine-readable representation.

All paths are validated against traversal and filesystem ancestors. Local
content is written to same-directory temporary files and atomically renamed.
The operation maintains a rollback ledger. Any required local write or
verification failure restores every replaced file and removes every created
file and empty directory. Local writes finish before global/remote mutations;
remote failure does not roll back an already-consistent local installation.
No shell interpolation, Git hooks, or project scripts are used.

## 15. GitHub mutation policy

Before creating labels, show repository identity and every name, color, and
description. Create only missing labels and never alter an existing same-name
label. Never create Issues, commits, pushes, branches, or PRs. The
`--no-github-mutations` flag suppresses all remote writes and leaves actionable
doctor failures. `--yes` accepts only mutations already enumerated in the plan.

## 16. Public CLI interface

V1 exposes exactly `init`, `doctor`, and `diff`.

### `init [path]`

Options are `--profile`, `--dry-run`, `--yes`, `--no-global`,
`--no-orca-registration`, `--no-github-mutations`, and `--json`. Init inspects
the repository and prerequisites, resolves a profile, shows and confirms the
ChangePlan, applies local changes, offers allowed external mutations, runs
doctor, and prints a first recommended prompt.

### `doctor`

Doctor reports `PASS`, `WARN`, `FAIL`, or `SKIP` for repository/remote, gh/auth,
schema and canonical config, Orca readiness, harness capabilities, global skill,
registration, local skills, Claude discovery, attribution, managed-block
integrity, manifest drift, required labels, and routing compatibility. Text and
JSON must be specific enough for remote support.

### `diff`

Diff is read-only and reports modified/missing manifest-owned files and managed
block changes. It shares the drift engine with init and doctor.

## 17. Internal module design

Commands delegate to one deep `WorkflowProject` module with `plan`, `apply`,
`doctor`, and `diff`. Internal seams are `HarnessAdapter` (Codex/Claude),
`FileSystemAdapter` (Node/in-memory), and `SkillSourceAdapter` (bundled snapshot
and maintainer-only upstream source). There is no tracker or runtime seam in V1
because GitHub and Orca are the only implementations.

## 18. Source layout

Source is grouped by CLI commands, workflow project/change planning,
configuration, artifact rendering, GitHub, Orca preflight, adapters, doctor, and
shared utilities. Templates contain skills, docs, profiles, and licenses.
Maintenance scripts cover upstream checking/sync and bundle validation.

## 19. Technology and package identity

Use strict TypeScript, ESM, Node.js 22+, Commander, `@clack/prompts`, Zod,
`yaml`, Execa argument arrays, Vitest, tsup, npm, and MIT. The canonical public
identity is repository `DYEWolf/orca-kit`, package `@dyewolf/orca-kit`, and bin
`orca-kit`.

## 20. Licensing and provenance

Original code is MIT. The repository and npm tarball include the root CLI
license, third-party notices, complete Matt Pocock MIT text, upstream repository,
commit and paths, disclosure of Orca modifications, and explicit non-affiliation
with Orca. Every configured project receives
`.agents/THIRD_PARTY_NOTICES.md`. The destination root license is never replaced,
and doctor validates required notices.

## 21. Security and safety

Treat repository contents, config, templates, Git output, and remote names as
untrusted. Use process argument arrays and no shell interpolation. Reject path
traversal and unsafe symlink ancestors. Never read or print secret environment
values; redact potentially credential-bearing output. Init network access is
limited to read-only or explicitly confirmed `gh`/Orca calls. Bundled skill
installation is offline. Pin dependencies and lockfiles, publish through GitHub
Actions trusted publishing/provenance, and inspect `npm pack` at release.

## 22. Verification strategy

Unit coverage includes config/profile resolution, managed blocks, paths,
deterministic plans, hashes/manifests, drift/collisions, harness capability,
label planning, and license rendering.

Required invariants include idempotent application, write-free dry-run,
byte-preservation outside AGENTS markers, refusal to overwrite drift/collisions,
complete rollback after injected failure, and zero Claude artifacts for
`codex-only`.

Integration fixtures cover new and invalid repositories, existing AGENTS files,
same/foreign/drifted installations, Claude collisions, mocked GitHub states, all
profiles, Windows paths/spaces/Unicode/CRLF, missing tools, and unavailable Orca.
CI uses temporary repositories and fake executables rather than live accounts.

Release gates pack and inspect the tarball, install that tarball in a fresh
repository, exercise dry-run/init/no-op/doctor/diff, run OS and Node matrices,
validate rendered skills/links/frontmatter, and perform live Orca smoke tests for
stable profiles. Claude-worker profiles require their additional lifecycle test.

## 23. Implementation phases

### Phase 0 — repository and decisions

Create the standalone repo, legal/community files, confirm npm scope, and record
this specification. Gate: identity available and notices present.

### Phase 1 — core and dry-run

Scaffold the project; implement schema, profiles, inspection, rendering,
ChangePlan, in-memory filesystem, drift, and codex-only dry-run. Gate:
deterministic tests prove planning writes nothing.

### Phase 2 — safe local application

Implement atomic transaction/rollback, AGENTS managed block, config/manifest,
docs, notices, complete pinned skill bundle and overlays, plus local
init/doctor/diff. Gate: repeated init is idempotent, unrelated content is
preserved, drift is refused, rollback is proven, and the packed CLI lifecycle
passes. The executable Phase 2 evidence is in `docs/phases/phase-2.md`.

### Phase 3 — Claude wrappers and coordinator

Resolve wrapper discovery, add Claude capability checks and artifacts, render all
profiles, and preserve stability labels. Gate: real Claude invocation plus
profile fixtures and no Claude artifacts in codex-only.

### Phase 4 — Orca and GitHub integration

Add readiness, global skill/registration offers, GitHub detection/auth/labels,
and external doctor coverage. Gate: every mutation is enumerated and confirmed.

### Phase 5 — public release

Complete platform matrix, trusted publishing, public docs, live stable-profile
smokes, Claude-worker test/promotion decision, and publish 1.0.0.

## 24. Open implementation research

- Blocking Phase 3: determine whether Claude reliably follows a wrapper's
  canonical-body reference; otherwise inline it.
- Blocking profile promotion: validate Claude worker lifecycle.
- Determine minimum Orca version and cross-platform installed-skill detection.
- Determine supported Claude effort values and Codex `xhigh`/`max` support.
- Confirm npm scope permission.
- Check Orca trademark/package naming before publication.
- Select final GitHub label colors and descriptions.

## 25. V1 acceptance criteria

V1 is complete only when npx configures an existing GitHub repository; stable
profiles match the manual reference and pass live routing/lifecycle tests;
codex-only emits no Claude files; Claude wrappers are actually discovered; the
17-skill bundle is complete, pinned, attributed, and validated; confirmed labels
exist or doctor fails; init is idempotent and preserves unmanaged content;
dry-run writes nothing; failed init leaves no partial local state; missing
prerequisites do not trigger installation/login; all external mutations are
confirmed and independently suppressible; no command creates Issues or Git
history/remotes; doctor text/JSON supports diagnosis; and the npm tarball is
clean, complete, and contains all notices.

## 26. Deferred to V2

- Conservative three-way `update` using manifest hashes and the prior tarball.
- ChangePlan-driven `configure` and profile transitions.
- `eject` that removes ownership metadata while preserving files.
- Schema migrations.
- Markdown tracker under `docs/issues/` owned only by the main-branch coordinator.
- Experimental custom command workers and custom coordinators.
- Additional trackers.

V1 records per-file hashes, schemaVersion, structural overlays/patches, and stops
on foreign versions specifically to make these additions possible without
guessing.

## 27. Migration and product risks

| Risk | Mitigation |
| --- | --- |
| Orca CLI changes | Version-aware checks and actionable doctor output |
| Model identifiers change | Editable versioned profiles; exact IDs vs aliases |
| Upstream skills change | Pinned snapshots, overlays, patches, maintainer reconciliation |
| User edits generated files | Hash drift refusal; no force |
| Claude wrapper reference fails | Blocking research with inline fallback |
| Claude worker misbehaves | Dependent profiles remain unpromoted |
| Affiliation confusion | Non-affiliation disclosure and trademark check |
| Windows symlink behavior | Generated wrapper files, no symlink contract |
| Existing instructions conflict | Managed block and conflict diagnostics |
| GitHub permissions insufficient | Read-only diagnosis and manual instructions |
| Missing labels break skills | Labels are contract; doctor fails |

## 28. First-session implementation instruction

Work in this standalone repository, never inside Vesti. Implement phases in
order, preserving the deep WorkflowProject module, ChangePlan-before-write,
non-destructive managed block, atomic rollback, pinned structural skill
overlays, per-file manifest hashes, and external-prerequisite boundary. Do not
implement V2 scope early. Use Orca for delegated repository work and do not
advance past a phase until its exit gate passes.

## 29. Approved decisions log

- Public standalone open source, original code MIT.
- Complete MIT attribution permits adapted skill redistribution.
- Existing repositories with GitHub remotes only; GitHub Issues only.
- Orca and harnesses are external user-owned prerequisites.
- Stable V1 profiles are codex-only and claude-coordinator; Claude-worker
  profiles await one smoke test.
- Required GitHub labels are installed with confirmation.
- Exactly 17 approved skills, pinned and structurally overlaid; no live init fetch.
- Managed AGENTS block, hash drift refusal, and no force.
- Public commands are init, doctor, and diff.
- Update/configure/eject, Markdown tracker, and custom workers are V2.
- Optional Orca skill installation/registration and labels require confirmation.
- Strict TypeScript, ESM, Node 22+, npm distribution.
- Canonical identity is `DYEWolf/orca-kit`, `@dyewolf/orca-kit`, and `orca-kit`.
