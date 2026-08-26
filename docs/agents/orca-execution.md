# Orca execution reference

`AGENTS.md` defines the invariants. This document is the operational checklist
for moving from a GitHub Issue to an integrated change.

## Planning and execution Runs

There are two distinct Run types:

- **Planning Run (optional):** explores, researches, or shapes a proposal. It
  may publish an issue body or decision record, but it does not claim the Issue
  and does not authorize implementation.
- **Issue-owned execution Run:** starts when an implementation Issue is claimed.
  It owns the Tasks, Dispatches, gates, review evidence, and integration handoff
  for that Issue. Keep exactly one execution Run per claimed implementation
  Issue, including corrections and review.

## Issue-to-Run transition

```text
[ ] Read the Issue body, relevant domain docs/ADRs, and linked dependencies.
[ ] If needed, keep exploration in a separate Planning Run.
[ ] Claim the implementation Issue: gh issue edit <n> --add-assignee @me
[ ] Bind or create its one execution Run and record the Issue number.
[ ] Choose the current, child, or top-level worktree.
[ ] Create bounded Tasks with acceptance, verification, and escalation rules.
[ ] Declare Orca Task dependencies; keep cross-Issue blockers in GitHub.
[ ] Dispatch only ready Tasks and wait for completion, questions, or escalations.
[ ] Run implementation, verification, and risk-required review gates.
[ ] Integrate, commit, and update the Issue with evidence; close at the final gate.
```

Record the transition in the Run:

```text
Issue: #<number> — <title>
Planning Run: <id or none>
Execution Run: <id>
Coordinator/integrator: <name or terminal>
Worktree/branch: <path> / <branch>
GitHub blockers: #<issue>, #<issue> | none
Orca Task blockers: <task-id> -> <task-id> | none
```

## Task and Dispatch contract

Every planning/evidence or implementation Task must be executable from its
contract:

```text
Objective: <one outcome>
Context: <only the facts needed to act>
Owned scope: <files/modules>
Constraints: <interfaces, invariants, and exclusions>
Acceptance criteria:
  - <verifiable result>
Verification:
  - <exact command or QA>
Escalate when: <architectural, API, data, security, or requirement decision>
Expected report:
  - files changed or inspected
  - verification commands and results
  - unspecified decisions and unresolved uncertainty
  - intentionally undone work
```

Implementation Tasks require a claimed implementation Issue and its single
Issue-owned execution Run. Planning/evidence Tasks belong to a separate
Planning Run or coordinator planning context and do not claim implementation.
Both require bounded scope, non-overlap with active writers, correct
dependencies, and a complete contract. A worker completion is a report, not
acceptance.

## Lifecycle and event transitions

The coordinator creates or binds the Run, writes contracts, dispatches ready
Tasks, waits for Orca mailbox events, evaluates evidence, and releases or
retains settled workers deliberately. Workers do not create new project work.

| Event | Required action | Next-phase rule |
| --- | --- | --- |
| Grilling approved | Record settled vocabulary and unresolved items. | Draft a spec only when explicitly requested or already authorized. |
| Full spec approved | Publish one non-executable umbrella/spec Issue and preserve approval evidence. | Draft tickets only when explicitly requested or already authorized. |
| Ticket breakdown approved | Create durable implementation Issues, blockers, verification, and labels. | Do not create workers or Runs merely because tickets exist. |
| Implementation Issue begins | Claim it, create/bind its one execution Run, choose worktree, and create the minimum Task DAG. | Dispatch only ready Task contracts. |
| Review returns `FIX_FIRST` | Keep integration blocked and create a correction Task in the same execution Run. | Re-run checks and review the corrected snapshot. |
| Worker escalates architecture | Pause the dependent path and record the coordinator's decision. | Update the contract before redispatching or canceling work. |

Moving into a new product phase is automatic only when the user explicitly
authorized the corresponding end-to-end flow. Otherwise complete the current
action, present the result, and wait.

## Gates

Record a short result in the Issue using the conventions in
`docs/agents/issue-tracker.md`:

```text
Gate: <pre-dispatch | implementation | verification | review | integration>
Issue: #<number>   Run: <run-id>   Task(s): <task-id(s)>
Evidence: <commands, report paths, or review link>
Result: PASS | BLOCKED | FAIL
Next action: <dispatch, correction Task, escalation, integration, or re-plan>
```

Pre-dispatch confirms the correct Run type, Issue claim, bounded contracts,
non-overlapping ownership, dependencies, and worktree. Implementation confirms
each report and out-of-contract decision. Verification runs exact commands and
separates environment limitations from failures. Review checks the actual diff
against the Issue and repository standards. Integration records final evidence
before closing the Issue.

## Verification and completion

Prefer deterministic checks: focused tests, typechecking, linting, builds,
schema checks, and exact QA commands named in the contract. If credentials,
network, browser, or external infrastructure is unavailable, report that limit
and arrange verification at the coordinator gate; do not call it a product
failure or silently claim success.

A worker's one completion report states files changed, summary, verification
commands and results, decisions not specified by the contract, unresolved
uncertainty, and intentionally undone work. Completion does not authorize
integration.

## Review and verdicts

Require independent review when failure could materially affect security,
authentication, user data, financial operations, persistent integrity,
availability, deployment, architectural boundaries, or broad cross-cutting
behavior. Routine bounded changes may rely on deterministic verification and
the normal review policy.

```text
[review]
Verdict: SHIP | FIX_FIRST | RETHINK
Issue: #<number>   Run: <run-id>
Diff: <commit/range or worktree>
Checks: <commands and results>
Findings: <evidence, severity, and file/line>
Follow-up: <none | correction Task | escalation/re-plan>
```

`SHIP` permits integration after the other gates. `FIX_FIRST` blocks
integration, routes a correction Task to an implementer, reruns affected checks,
and reviews the corrected snapshot. `RETHINK` stops implementation and
integration until the requirement or architecture is made explicit.

## Escalation

Use an Orca question when the coordinator can answer a bounded clarification.
Use an escalation when work is blocked or crosses worker authority:

```text
Type: question | escalation
Issue: #<number>   Run: <run-id>   Task: <task-id>
Trigger: <what was discovered>
Evidence: <file:line, command output, or linked decision>
Blocked action: <what cannot proceed safely>
Decision needed: <specific question>
Options/tradeoff: <known choices, if any>
Requested owner: <coordinator or architectural authority>
```

Record the answer as a decision and update the Task contract before continuing.

## Worktree decision table

The execution Run owner records the choice. Workers stay inside the assigned
worktree and scope.

| Situation | Worktree |
| --- | --- |
| Uncommitted dependency, exact checkout, read-only investigation, or shared verification | Current worktree |
| Isolated implementation, conflicting writers, or stacked work | Orca child worktree |
| Independent work from the repository default base | New top-level worktree |

```text
Choice: current | child | top-level
Reason: <dependency, isolation, or base-branch rationale>
Path: <absolute path>
Branch: <branch>
Integration owner: <coordinator/integrator>
```

The coordinator/integrator owns staging, commits, merges, cherry-picks, pushes,
and conflict continuation. After integration, attach verification and
resolution evidence to the Issue and close it only when the final gate is green.
