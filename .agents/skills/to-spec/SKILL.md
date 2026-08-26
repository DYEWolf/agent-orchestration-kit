---
name: to-spec
description: Turn an understood conversation into a complete, approved, non-executable umbrella specification and publish it to the configured issue tracker.
---

# To Spec

Sol owns the conversation and synthesizes what has already been discussed. This skill does not conduct a new interview, dispatch workers, or route implementation work. If a fact is still missing, the coordinator may create a bounded Orca evidence Task and must integrate its report before presenting the draft; see `docs/agents/orca-execution.md`.

Read `docs/agents/issue-tracker.md` for the publication mechanism. The specification is a durable project boundary, not an executable worker task.

## Process

1. Gather the full conversation, accepted grilling decisions, relevant domain vocabulary, ADRs, and any returned evidence. Do not invent unresolved requirements.
2. Sketch the highest useful test seams, preferring existing seams. Explain any new seam as a proposal in the draft.
3. Write the complete specification using the template below. Keep implementation decisions at the level of behavior, interfaces, contracts, constraints, and architecture; avoid brittle file paths and code snippets unless a compact decision shape genuinely requires one.
4. Present the entire draft to the user and request explicit approval of the full specification. Approval must be unambiguous; silence, a partial edit, or approval of one section is not approval of the whole document. Revise and present again when the user changes anything.
5. Only after explicit full-spec approval, publish one umbrella/spec issue. Mark it visibly as non-executable and not ready for implementation. Do not apply `ready-for-agent` or any implementation-ready label to this issue.
6. Stop after publication. Do not create implementation tickets or dispatch workers unless the user explicitly starts the next phase or an explicitly authorized end-to-end flow includes it.

## Specification template

## Problem Statement

The problem the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

Numbered user stories covering the agreed behavior:

1. As an `<actor>`, I want a `<feature>`, so that `<benefit>`.

## Implementation Decisions

Decisions about modules, interfaces, seams, architecture, schema, API contracts, and interactions. Include only decisions made or explicitly accepted in the conversation.

## Testing Decisions

Describe observable behavior, the seams to test, the modules involved, and relevant prior art. Tests should verify behavior through public interfaces rather than implementation details.

## Constraints and Risks

Record constraints that an implementation must honor and risks that require mitigation or explicit verification.

## Out of Scope

Describe what this specification does not promise.

## Further Notes

Include supporting context, evidence pointers, and unresolved items that do not block the approved scope.

The published issue is an umbrella/spec record. Its contents may guide later implementation issues, but it must not be treated as an agent-grabbable task.
