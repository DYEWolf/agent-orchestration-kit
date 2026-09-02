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

Keep the body as the stable executable contract. Put changing progress,
decisions, verification output, review findings, and handoff evidence in
comments.

```markdown
## Parent
<!-- Approved umbrella/spec Issue or durable decision source. -->

## Objective
<!-- One concise outcome. -->

## Context
<!-- Facts needed to act. -->

## Scope
<!-- Owned files/modules and explicit exclusions. -->

## Constraints
<!-- Interfaces, invariants, and decisions that must not change. -->

## Non-goals
<!-- Behavior this Issue deliberately does not own. -->

## Acceptance criteria
<!-- Externally verifiable outcomes. -->

## Verification
<!-- Exact commands, QA, and review gates. -->

## Risks and review
<!-- Material blast radius, mitigation, and independent-review need. -->

## Dependencies
<!-- GitHub Issues that block this Issue, if any. -->
```

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
  required, and deferred work before close.

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

## Campaign Record

Only an explicit `$campaign` start appends a Campaign Record. After successful
read-only atomic preflight and the relevant authorization answers, append one
immutable anchor-Issue comment beginning exactly:

```markdown
[decision] Campaign Record
<!-- orca-campaign-record:v1 -->
```

Record the stable Campaign identity, fixed ordered membership/anchor, repository remote and target branch,
base and local mutations, selected relevant Preauthorized Mutations, Protected
Mutation policy, cross-Issue concurrency of one, inherited worker limit,
integration route, pause/stopping conditions, and creation time. Do not update
it with a mutable Campaign status. Reconstruct status from Issues and Orca Runs;
use the existing tagged comments above for evidence and resolution. A blocked
but otherwise complete Issue may be a future member without `ready-for-agent`,
while an unblocked member must carry it; it never expands membership later.
Choose a common umbrella anchor when parent/umbrella facts identify one,
otherwise the first member; an explicit alternate must be a provided relevant
existing Issue and need not be membership.

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
