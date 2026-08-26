# Issue tracker: GitHub

This workflow uses GitHub Issues in `DYEWolf/orca-kit` as durable human work
units. Use the authenticated `gh` CLI for all Issue operations; infer the
repository explicitly when needed with `--repo DYEWolf/orca-kit`. Orca owns
execution state inside a Run, while GitHub preserves the durable contract,
ownership, comments, labels, and dependencies.

## Planning versus execution

An open unassigned Issue is unclaimed work. A Planning Run may investigate or
shape it without claiming implementation. A planning or decision Issue may be
assigned for planning, but it still does not receive an issue-owned execution
Run. An implementation Issue becomes executable only after approval, claim,
complete acceptance and verification criteria, and resolution of its blockers.

The first write for an implementation Issue is the claim:

```bash
gh issue edit <number> --repo DYEWolf/orca-kit --add-assignee @me
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
gh issue create --repo DYEWolf/orca-kit --title "<title>" --body-file <body.md>
gh issue view <number> --repo DYEWolf/orca-kit --comments
gh issue list --repo DYEWolf/orca-kit --state open --json number,title,body,labels,assignees,comments
```

Read the full body, comments, labels, assignees, and linked dependencies before
acting. Do not infer completion from an Orca worker's completion report.

## Comments and ownership

Operational comments begin with one durable tag:

- `[progress]` — what changed, what is next, and any blocker.
- `[decision]` — the decision, alternatives, and reason.
- `[verification]` — command or QA, result, and environment limitation.
- `[review]` — `SHIP`, `FIX_FIRST`, or `RETHINK`, with evidence and follow-up.
- `[resolution]` — final outcome, verification, and deferred work before close.

```bash
gh issue comment <number> --repo DYEWolf/orca-kit --body "[progress] ..."
gh issue edit <number> --repo DYEWolf/orca-kit --add-assignee @me
gh issue edit <number> --repo DYEWolf/orca-kit --remove-assignee @me
gh issue close <number> --repo DYEWolf/orca-kit --comment "[resolution] ..."
```

Assignees express human ownership; labels express triage metadata. An open
assigned planning Issue remains planning. An open assigned implementation Issue
is claimed only when its execution Run is also bound or created. Closing an
Orca Task does not close an Issue.

## Labels

Use existing repository labels and preserve their meaning. The standard
workflow labels are:

- `ready-for-agent` — approved, executable, unblocked implementation Issue.
- `wontfix` — intentionally closed without implementation.
- `wayfinder:map` — a decision map Issue.
- `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`,
  `wayfinder:task` — map child types.

```bash
gh issue edit <number> --repo DYEWolf/orca-kit --add-label "ready-for-agent"
gh issue edit <number> --repo DYEWolf/orca-kit --remove-label "ready-for-agent"
gh label list --repo DYEWolf/orca-kit
```

Do not invent labels in a Task contract or use labels as a substitute for
assignees, Issue state, dependencies, or Run state.

## Dependencies

Dependencies between durable human work units live in GitHub. Use GitHub's
native dependency API with the blocker's numeric database ID, not its Issue
number:

```bash
blocker_id=$(gh api repos/DYEWolf/orca-kit/issues/<blocker> --jq .id)
gh api --method POST \
  repos/DYEWolf/orca-kit/issues/<child>/dependencies/blocked_by \
  -F issue_id="$blocker_id"
```

Inspect the live gate with `issue_dependencies_summary.blocked_by`; an Issue is
unblocked only when every blocker is closed. Orca Task dependencies still order
Tasks inside one Issue's execution Run and never replace a GitHub dependency.

## Wayfinding operations

`$wayfinder` uses one map Issue labelled `wayfinder:map` and child decision
Issues labelled by type. Where GitHub sub-Issues are available, link children
through the sub-Issue endpoint; otherwise put `Part of #<map>` at the top of the
child body. Use native dependency edges for blockers. Claim a Wayfinder child
for bounded planning work, but do not create an execution Run merely because it
is labelled `wayfinder:task`; only an approved implementation Issue from the
specification/ticket flow receives the one execution Run.

Resolve a map child with a `[resolution]` comment, close it, and append a concise
context pointer to the map's Decisions-so-far. Keep Issue names readable in
human-facing narration and preserve IDs and links inside the names.
