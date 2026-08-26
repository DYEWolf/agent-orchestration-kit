---
name: implement
description: Implement a piece of work based on a spec or set of tickets.
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

Implement the work described by the user in the spec or tickets.

Use tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use code-review to review the work.

Commit your work to the current branch.
