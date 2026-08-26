---
name: wayfinder
description: Plan large efforts as a shared map of decision issues and resolve one decision at a time under coordinator-supervised Orca work.
---

# Wayfinder

Wayfinder finds the route to a destination; it does not silently execute the destination.
Read `AGENTS.md`, `docs/agents/issue-tracker.md`, and, when present,
`docs/agents/orca-execution.md`. The tracker document owns provider-specific issue
operations, while AGENTS and Orca own routing and lifecycle. Do not invoke unavailable
helper skills or substitute an informal worker hierarchy.

## Modes and ownership

- **Coordinator mode:** create and maintain the map, create/claim decision issues,
  dispatch bounded evidence Tasks through Orca, record resolutions, and decide when the
  route is clear.
- **Worker mode:** perform only the bounded evidence or analysis in the Dispatch. Return
  findings, citations, and uncertainty through the Dispatch. Do not create issues, Runs,
  Tasks, nested workers, or resolutions; the coordinator owns the map and decisions.

Resolve at most one decision issue per session. A coordinator may run independent
read-only evidence Tasks in parallel when ownership and scope are separate, subject to
the limits and dependencies in `AGENTS.md`; workers never parallelize by creating their
own work.

## Plan, don't do

Start by naming the destination: the spec, decision, or change this map must make
possible. The destination fixes scope. Planning is complete when no decision remains
before execution can begin; implementation belongs in a later issue-owned execution
flow. The map's Notes may record that a named end-to-end flow is authorized, but Notes
never authorize destination implementation by themselves.

Use decision issues for questions whose answer changes the route. Use an evidence Task
only when a bounded fact, local inspection, or external primary source is required to
answer a decision. An evidence Task produces a cited report for the coordinator; it is
not a disguised implementation slice. If a decision cannot yet be stated precisely,
keep it in the map's fog instead of pre-slicing it.

## The map issue

Create one tracker issue using the map metadata documented by the tracker. Its body is
low-resolution and contains:

```markdown
Type: wayfinder-map

## Destination
<one or two lines describing what reaching the end looks like>

## Notes
<domain, relevant docs, standing constraints, and whether execution is authorized>

## Decisions so far
<!-- closed decision names and one-line gists, each linked to its issue -->

## Not yet specified
<!-- in-scope questions that cannot yet be stated sharply -->

## Out of scope
<!-- consciously ruled-out work, with the reason and issue link when applicable -->
```

The map is an index, not a second decision record. Refer to map and ticket names in
human-facing text; keep tracker numbers and URLs inside the links.

## Create and wire decision issues

Each child issue has one question sized for a session:

```markdown
Type: wayfinder-<research|prototype|grilling|task>
Part of: #<map>

## Question
<the precise decision or investigation this issue resolves>
```

Create all currently specifiable children first, then wire parent/child and blocking
relationships in a second pass using the tracker's native mechanisms. The `Type` line is
stable Wayfinder metadata, while the native sub-issue relation is the canonical hierarchy
when available. Do not create or require `wayfinder:*` labels. Labels remain repository
triage metadata, and `ready-for-agent` is reserved for approved implementation issues.

Before any work on a ticket, claim it by assigning the driving owner. The frontier is an
open, unblocked, unclaimed child. Read only the map first; load related ticket details
as needed. Identify children from the map's native sub-issues, or its documented fallback,
and confirm their `Type` metadata from the body. The user may work unblocked tickets in
parallel, so expect tracker edits from other sessions.

## Work through the map

1. Load the map and choose the user-named ticket, or the first frontier ticket in map
   order.
2. Claim it before investigation. If a worker is needed, the coordinator writes a
   bounded Orca Task with objective, context, evidence scope, acceptance, verification,
   escalation conditions, and expected report, then dispatches it. The worker reports
   back; it does not resolve the issue.
3. Reconcile evidence with the question. If new questions are now sharp, create and wire
   new issues. If they are still fog, update `Not yet specified` only.
4. Record the answer as a resolution comment, close the decision issue, and append one
   linked gist to `Decisions so far`. Do not put a decision in both places as competing
   sources of truth.
5. If a ticket is beyond the destination, close it as out of scope and record why under
   `Out of scope`; it must not appear among decisions so far.

Do not start destination implementation directly from a wayfinding session. A map's
Notes and a coordinator's explicit authorization may authorize an end-to-end flow to
automate transitions, but they cannot skip any gate or authorize implementation from
the map itself. The flow must complete and record each required gate in order:

1. grilling/decision approval;
2. `$to-spec` and explicit approval of the complete full specification;
3. `$to-tickets` and approval of the ticket breakdown;
4. publication of durable implementation issues with dependency and verification
   requirements; and
5. claim of the implementation issue, creation or binding of its issue-owned Orca Run,
   and creation of bounded Tasks before dispatch.

If a gate is missing, partial, ambiguous, or not explicitly approved, stop at that
boundary, present the result, and wait. When all gates succeed, hand the approved
issue/spec and decision links to the issue-owned implementation flow; Wayfinder still
does not execute the destination itself.

## Fog of war

The fog is in-scope but not yet sharp. A question belongs in the frontier when it can be
phrased precisely, even if blocked. It belongs in `Not yet specified` when its shape
depends on an unresolved decision. Graduating fog means creating a new child issue and
removing that item from the map's fog; never list open tickets redundantly in the map.

## Completion and escalation

The coordinator owns issue writes, map updates, Run/Task lifecycle, and any transition
to implementation. Escalate when a decision changes architecture, a public or persistent
contract, security assumptions, or the destination itself. Keep the map paused until the
coordinator resolves that gate. Keep evidence redacted and cite sources without copying
secrets or large source passages.
