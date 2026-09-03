# Issue tracker: GitHub

This workflow uses GitHub Issues in `DYEWolf/agent-orchestration-kit` as durable human work
units. Use the authenticated `gh` CLI for all Issue operations; infer the
repository explicitly when needed with `--repo DYEWolf/agent-orchestration-kit`. Orca owns
execution state inside a Run, while GitHub preserves the durable contract,
ownership, comments, labels, and dependencies.

Classify requests with `docs/agents/execution-policy.md` before creating an
Issue. A trivial, low-risk, low-uncertainty, isolated direct change does not need
a fabricated Issue or Run. If work is already Issue-owned, or its route requires
durable ownership, preserve the lifecycle below.

## Planning versus execution

An open unassigned Issue is unclaimed work. A Planning Run may investigate or
shape it without claiming implementation. A planning or decision Issue may be
assigned for planning, but it still does not receive an issue-owned execution
Run. An implementation Issue becomes executable only after approval, claim,
complete acceptance and verification criteria, and resolution of its blockers.

The first write for an implementation Issue is the claim:

```bash
gh issue edit <number> --repo DYEWolf/agent-orchestration-kit --add-assignee @me
```

Immediately after claiming, bind or create exactly one Issue-owned Orca
execution Run. That Run owns every implementation, verification, correction,
and review Task for the Issue. Never create a second execution Run for the same
claimed implementation Issue; a Planning Run remains separate.

## Durable Issue body

This is the single Issue body template for implementation Issues. `$to-tickets`
publishes with it, `$implement` reads it, and Campaign preflight validates it.
Keep the body as the stable executable contract; put changing progress,
decisions, verification output, review findings, and handoff evidence in
comments.

```markdown
## Parent
<!-- Approved umbrella/spec Issue or durable decision source. -->

## Objective
<!-- The end-to-end behavior this Issue makes work, from the user's perspective. -->

## Context
<!-- Facts and evidence pointers needed to act. -->

## Scope
<!-- Owned files/modules and explicit exclusions. -->

## Constraints and non-goals
<!-- Interfaces, invariants, compatibility requirements, and behavior this Issue does not own. -->

## Acceptance criteria
- [ ] <!-- Externally verifiable outcome -->

## Risks and review
<!-- Material blast radius, mitigations, and whether independent review is required. -->

## Verification
<!-- Exact deterministic commands, QA, and review gates. -->

## Blocked by
<!-- Each genuine blocking Issue, or `None (can start immediately)`. -->
```

Required for executability and Campaign preflight: `Objective`, `Acceptance
criteria`, `Constraints and non-goals`, `Risks and review`, `Verification`, and
`Blocked by`. `Context` and `Scope` may be short but must not be omitted.
Issues published before this template are read with `What to build` as
`Objective`, `Risks and mitigations` as `Risks and review`, and `Dependencies`
as `Blocked by`; do not rewrite their bodies solely to rename headings.

Create an Issue only when the active skill and user-authorized phase call for
it:

```bash
gh issue create --repo DYEWolf/agent-orchestration-kit --title "<title>" --body-file <body.md>
gh issue view <number> --repo DYEWolf/agent-orchestration-kit --comments
gh issue list --repo DYEWolf/agent-orchestration-kit --state open --json number,title,body,labels,assignees,comments
```

Read the full body, comments, labels, assignees, and linked dependencies before
acting. Do not infer completion from an Orca worker's completion report.

## Comments and ownership

Operational comments begin with one durable tag:

- `[progress]` — what changed, what is next, and any blocker.
- `[decision]` — the decision, alternatives, and reason.
- `[verification]` — exact candidate identity, command or QA, result, and
  environment limitation.
- `[review]` — full or delta mode, exact candidate identity, `SHIP`,
  `FIX_FIRST`, or `RETHINK`, stable finding IDs, evidence, and follow-up.
- `[resolution]` — final candidate identity, outcome, verification, review when
  required, resource disposition, and deferred work before close.

```bash
gh issue comment <number> --repo DYEWolf/agent-orchestration-kit --body "[progress] ..."
gh issue edit <number> --repo DYEWolf/agent-orchestration-kit --add-assignee @me
gh issue edit <number> --repo DYEWolf/agent-orchestration-kit --remove-assignee @me
gh issue close <number> --repo DYEWolf/agent-orchestration-kit --comment "[resolution] ..."
```

Assignees express human ownership; labels express triage metadata. An open
assigned planning Issue remains planning. An open assigned implementation Issue
is claimed only when its execution Run is also bound or created. Closing an
Orca Task does not close an Issue.

Before closing an implementation Issue, record every expected execution
resource as `removed`, `retained`, or `not-created`. A retained resource must
name the exact path/identity, the unique or uncertain state that prevents safe
removal, and the recovery action. Do not close and advance a Campaign while
that finalization blocker remains. A closed Issue, merged branch, or successful
workflow is not by itself proof that a worktree is disposable.

## Campaign Record

Only an explicit `$campaign` start appends a Campaign Record, as exactly one
immutable comment on the anchor Issue beginning:

```markdown
[decision] Campaign Record
<!-- orca-campaign-record:v1 -->
```

Its required contents, anchor selection, and membership rules are defined in
`.agents/skills/campaign/references/preflight-and-record.md`. It is an
authorization, never a mutable status ledger: reconstruct status from Issues
and Orca Runs and use the tagged comments above for later evidence.

## Labels

Use existing repository labels and preserve their meaning. The only label
required by this workflow is:

- `ready-for-agent` — approved, executable, unblocked implementation Issue whose
  objective, constraints, acceptance criteria, risks/review, and verification
  contract are complete.

`wontfix` may be used when the repository wants to distinguish intentional
non-implementation, but it is not required by the workflow. Wayfinder types are
body metadata, not labels.

```bash
gh issue edit <number> --repo DYEWolf/agent-orchestration-kit --add-label "ready-for-agent"
gh issue edit <number> --repo DYEWolf/agent-orchestration-kit --remove-label "ready-for-agent"
gh label list --repo DYEWolf/agent-orchestration-kit
```

Do not create or depend on `wayfinder:*` labels. Do not invent labels in a Task
contract or use labels as a substitute for assignees, Issue state,
dependencies, or Run state.

## Dependencies

Dependencies between durable human work units live in GitHub. Use GitHub's
native dependency API with the blocker's numeric database ID, not its Issue
number:

```bash
blocker_id=$(gh api repos/DYEWolf/agent-orchestration-kit/issues/<blocker> --jq .id)
gh api --method POST \
  repos/DYEWolf/agent-orchestration-kit/issues/<child>/dependencies/blocked_by \
  -F issue_id="$blocker_id"
```

Inspect the live gate with `issue_dependencies_summary.blocked_by`; an Issue is
unblocked only when every blocker is closed. Orca Task dependencies still order
Tasks inside one Issue's execution Run and never replace a GitHub dependency.

## Wayfinding operations

Used by `$wayfinder`. The map is one Issue with child Issues as tickets.

- **Metadata, not labels:** put `Type: wayfinder-map` at the top of the map body.
  Put `Type: wayfinder-<research|prototype|grilling|task>` and
  `Part of: #<map>` at the top of each child body. Do not create or depend on
  `wayfinder:*` labels. `ready-for-agent` is reserved for approved implementation
  Issues and is never implied by `Type: wayfinder-task`.
- **Hierarchy:** use GitHub's native sub-Issue relation as the canonical
  hierarchy. Keep `Part of: #<map>` as a portable context pointer. If sub-Issues
  are unavailable, maintain a task list of children in the map body; the task
  list plus `Part of` is the hierarchy fallback.
- **Blocking:** use GitHub's native Issue dependencies as the canonical gate. If
  dependencies are unavailable, put `Blocked by: #<issue>` at the top of the
  child body. A ticket is unblocked only when every blocker is closed.
- **Frontier:** list the map's open children from native sub-Issues or the
  fallback task list, confirm their `Type` metadata, and exclude assigned or
  blocked children. The first remaining child in map order wins.
- **Ownership:** claim a child with its assignee. Keep Wayfinder work in planning
  context by default. Bounded evidence Tasks may run in a planning Run, but a
  child receives an Issue-owned execution Run only if the separate spec/ticket
  flow approved it as implementation work and it carries `ready-for-agent`.
- **Resolution:** comment with `[resolution]`, close the child, and append a
  concise linked gist to the map's Decisions-so-far.

Keep Issue names readable in human-facing narration and preserve IDs and links
inside the names.
