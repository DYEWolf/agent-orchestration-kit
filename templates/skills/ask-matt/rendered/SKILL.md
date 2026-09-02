---
name: ask-matt
description: Ask which skill or flow fits your situation. A router over the
  skills in this repo.
---

## Orca execution overlay

The following rules are part of this installed skill and override conflicting
instructions in the upstream body below.

- The coordinator owns the user conversation, GitHub Issue state, Orca Run and
  Task DAG, worktree placement, gates, and final integration decisions.
- A dispatched worker performs only its bounded Task. It does not create Runs,
  Tasks, worktrees, branches, nested agents, or background agents.
- Where the upstream text says to call a Skill tool, invoke a named installed
  skill through the current harness's supported skill discovery. A worker asks
  its coordinator when another Task or skill invocation is required.
- Where the upstream text says to ask or wait for the user, the coordinator uses
  the user conversation; a worker uses the Orca ask/reply flow.
- Where the upstream text says to spawn a subagent, background agent, or parallel
  reviewer, the coordinator creates bounded Orca Tasks and Dispatches. Workers
  never nest delegation.
- Repository mutations such as assignment, Issue updates, commits, staging,
  branching, or conflict continuation happen only when the Task contract assigns
  them to that actor. The CLI itself never commits, pushes, branches, or opens a
  pull request.
- A worker completes its Dispatch exactly once with concrete evidence and stops.
  Review workers report `SHIP`, `FIX_FIRST`, or `RETHINK` and do not implement
  their own corrections.
- GitHub tracker operations follow `docs/agents/issue-tracker.md`. Do not fall
  back to a local Markdown tracker in this installation.

The remaining section is the pinned upstream procedure, adapted only by the
recorded maintainer patch shipped with this snapshot.

## Pinned upstream procedure

# Ask Matt

Route work only through the skills installed by orca-kit. Name skills neutrally;
the active harness decides the invocation syntax.

## Main product flow

1. When the destination is clear but details remain unresolved, start with
   grill-with-docs. It uses grilling and domain-modeling to establish shared
   language and decisions.
2. When the effort is too foggy or too large for one session, use wayfinder to
   create and resolve a bounded decision map. When the route becomes buildable,
   return to grill-with-docs if conversational alignment remains.
3. After the understanding gate is approved, use to-spec.
4. After the specification gate is approved, use to-tickets.
5. After the ticket breakdown is approved, use implement once per claimed,
   executable, unblocked GitHub implementation Issue.
6. Implementation uses tdd where appropriate and risk-based code-review before
   the Issue is closed.

Completing one phase never silently invokes the next. Even when the user
authorizes an end-to-end flow, pause at the understanding, specification, and
ticket-breakdown gates.

## Other routes

- A difficult or intermittent defect: diagnosing-bugs, then tdd for the
  regression and improve-codebase-architecture if the missing seam is systemic.
- Codebase health: improve-codebase-architecture to find candidates, then
  codebase-design to shape the selected change.
- A question needing runnable evidence: prototype.
- Primary-source reading: research.
- A merge or rebase already in conflict: resolving-merge-conflicts.
- A portable context transfer: handoff.
- Direct vocabulary work: domain-modeling or codebase-design.
- A focused review: code-review.

## Installed vocabulary

The complete installed set is: ask-matt, grill-with-docs, to-spec, to-tickets,
implement, wayfinder, improve-codebase-architecture, handoff, grilling,
domain-modeling, research, prototype, tdd, diagnosing-bugs, codebase-design,
code-review, and resolving-merge-conflicts.

Campaign is installed but explicit-only: do not start it from this router.
Only an explicit user request may invoke campaign for a fixed Issue set.

Do not route to any skill outside this list.
