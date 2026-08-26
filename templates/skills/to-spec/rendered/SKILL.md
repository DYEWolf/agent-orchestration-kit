---
name: to-spec
description: "Turn the current conversation into a spec and publish it to the
  project issue tracker: no interview, just synthesis of what you've already
  discussed."
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

This skill takes the current conversation context and codebase understanding and produces a spec. Do NOT interview the user; just synthesize what you already know.

The issue tracker and triage label vocabulary should have been provided to you. If not, follow `docs/agents/issue-tracker.md`; if it is missing, report an incomplete orca-kit installation.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.

2. Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Check with the user that these seams match their expectations.

3. Write the spec using the template below, then publish it to the project issue tracker. Apply the `ready-for-agent` triage label - no need for additional triage.

<spec-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this spec.

## Further Notes

Any further notes about the feature.

</spec-template>
