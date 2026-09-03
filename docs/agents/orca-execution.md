# Orca execution reference

`AGENTS.md` defines the invariants and `docs/agents/execution-policy.md` defines
classification, context budgets, verification scope, checkpoints, and
candidate-bound review. This document is the operational checklist for moving
from a request or GitHub Issue to an integrated change.

Classify before creating lifecycle objects. A trivial, low-risk,
low-uncertainty, isolated change may execute directly with targeted
verification and no fabricated Issue, Run, Task, worker, or reviewer. The
remaining sections apply when the selected route or existing durable ownership
requires them.

## Planning and execution Runs

There are two distinct Run types:

- **Planning Run (optional):** explores, researches, or shapes a proposal. It
  may publish an issue body or decision record, but it does not claim the Issue
  and does not authorize implementation.
- **Issue-owned execution Run:** starts when an implementation Issue is claimed.
  It owns the Tasks, Dispatches, gates, review evidence, and integration handoff
  for that Issue. Keep exactly one execution Run per claimed implementation
  Issue, including corrections and review.

## Campaign authorization

`$campaign` is an explicit-only runtime authorization over a user-provided,
ordered fixed set of approved implementation Issues. It is not a Run or a
permanent execution-mode setting: each member retains one Issue-owned execution
Run, and manual execution remains the default. Read-only atomic preflight may
include an otherwise complete blocked Issue without `ready-for-agent` as a
future member; an unblocked member must carry the label, and any incomplete or
conflicted member rejects the entire proposal with no effects. A common existing
umbrella is the default record anchor, otherwise the first member is used; an
explicit alternate must be a provided relevant existing anchor and need not be
membership.

After presenting the proposed authorization/frontier and receiving only the
relevant optional Preauthorized Mutation decisions—push integration commits,
create/update branches, pull-request create/update/merge on the PR route, and
remote workflow trigger/rerun only for Issues that require it—append the immutable
`[decision] Campaign Record` comment with
`<!-- orca-campaign-record:v1 -->` to its anchor Issue and immediately execute.
Reconstruct status from GitHub/Orca and use ordinary tagged comments for later
progress and resolution. Cross-Issue concurrency is one; inherited worker
concurrency applies inside that one active Issue.

An Issue Pause permits other independent members; a Campaign Pause stops all
members. Protected Mutations require an immediate confirmation of the pending
mutation: publishing, deployment/protected environments, secrets/credentials,
protection changes, destructive external actions, and global machine/account
changes. Resume reuses the immutable record and existing Issue-owned Runs;
cancellation stops new work, releases Campaign-owned terminals/worktrees,
unassigns unaccepted Issues, records incomplete progress/evidence, preserves
accepted evidence, and performs no rollback. Corrections remain in the existing
Run; investigate failures, preserve stable review finding IDs, pause on two
equivalent blocking review rounds or three same-context execution failures, and
never retry `RETHINK`. Campaign membership does not require review. Close only
after candidate-bound verification, candidate-bound `SHIP` when required,
exactly one coordinator-owned integration commit, target identity revalidation,
and remote-target containment.

## Issue-to-Run transition

```text
[ ] Classify shape, risk, uncertainty, and locality; record the minimum route.
[ ] Read the Issue body, relevant domain docs/ADRs, and linked dependencies.
[ ] If needed, keep exploration in a separate Planning Run.
[ ] Claim the implementation Issue: gh issue edit <n> --add-assignee @me
[ ] Bind or create its one execution Run and record the Issue number.
[ ] Choose the current, child, or top-level worktree.
[ ] Create bounded Tasks with acceptance, verification, and escalation rules.
[ ] Declare Orca Task dependencies; keep cross-Issue blockers in GitHub.
[ ] Dispatch only ready Tasks and wait for completion, questions, or escalations.
[ ] Run implementation, verification, and risk-required review gates.
[ ] Revalidate candidate identity and its receipt.
[ ] Integrate, commit, and update the Issue with evidence; close at the final gate.
```

Record the transition in the Run:

```text
Issue: #<number> — <title>
Planning Run: <id or none>
Execution Run: <id>
Coordinator/integrator: <name or terminal>
Worktree/branch: <path> / <branch>
Route: <direct | single-worker | task-dag | decision-first>
Classification: <shape/risk/uncertainty/locality>
Verification/review: <scope> / <mode>
Budgets: <workers>; <blocking review rounds>
GitHub blockers: #<issue>, #<issue> | none
Orca Task blockers: <task-id> -> <task-id> | none
```

## Task and Dispatch contract

Every planning/evidence or implementation Task must be executable from its
contract:

```text
Objective: <one outcome>
Context: <selected facts and source/evidence pointers needed to act>
Owned scope: <files/modules>
Constraints: <interfaces, invariants, and exclusions>
Acceptance criteria:
  - <verifiable result>
Verification:
  - <exact command or QA>
Escalate when: <architectural, API, data, security, or requirement decision>
Expected report:
  - files changed or inspected
  - one result per acceptance criterion and verification command
  - unspecified decisions and unresolved uncertainty
  - intentionally undone work
```

Implementation Tasks require a claimed implementation Issue and its single
Issue-owned execution Run. Planning/evidence Tasks belong to a separate
Planning Run or coordinator planning context and do not claim implementation.
Both require bounded scope, non-overlap with active writers, correct
dependencies, and a complete contract. A worker completion is a report, not
acceptance. Do not inject raw conversation history, complete terminal logs, or
global worker/Run inventories into a Dispatch or completion report.

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
| Verification exposes a new deterministic harness failure | Classify it against the continuation envelope and assign a new finding ID. | Repair directly when the authorized surface and budget allow it; otherwise pause. Do not call it recurrence of an earlier resolved finding. |
| Verification repeats the same deterministic finding | Preserve its stable ID and increment the same-context counter. | Do not rerun unchanged bytes; pause at the recorded recurrence limit. |
| Review returns `FIX_FIRST` | Keep integration blocked, preserve stable finding IDs, and create a correction Task in the same execution Run. | Re-run affected checks and use delta review when the correction stays confined to those IDs; full review when scope/risk expands. Pause after two equivalent blocking rounds. |
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
Candidate: <commit-and-tree or WIP snapshot SHA-256>
Evidence: <commands, report paths, or review link>
Result: PASS | BLOCKED | FAIL
Next action: <dispatch, correction Task, escalation, integration, or re-plan>
```

Pre-dispatch confirms the correct Run type, Issue claim, bounded contracts,
non-overlapping ownership, dependencies, and worktree. Implementation confirms
each report and out-of-contract decision. Verification runs exact commands and
separates environment limitations from failures. Review checks the exact
candidate against the Issue and repository standards. Integration recomputes
candidate identity and records final evidence before closing the Issue. A
mismatch invalidates affected verification and review evidence.

## Verification and completion

Choose targeted, module, or full scope according to
`docs/agents/execution-policy.md`. Prefer deterministic checks: focused tests,
typechecking, linting, builds, schema checks, and exact QA commands named in the
contract. A full suite is not automatic when focused evidence covers a
low-risk change. If credentials, network, browser, or external infrastructure
is unavailable, report that limit and arrange verification at the coordinator
gate; do not call it a product failure or silently claim success.

For remote verification, use the progressive funnel in the execution policy:
focused local evidence, then a representative remote canary or affected cells
when the workflow supports them, and finally the complete required matrix for
the final candidate. Record the last successful pipeline stage. If several jobs
fail with the same signature, inspect one complete representative log and only
the concise status/signature of the others. A newly reachable downstream stage
gets a new finding ID; rerunning an unchanged deterministic failure is not
verification.

A worker's one completion report states files changed, a bounded result for each
acceptance criterion and verification command, decisions not specified by the
contract, unresolved uncertainty, and intentionally undone work. Include only
the diagnostic excerpt needed for a failed check. Completion does not authorize
integration.

## Review and verdicts

Require independent review when failure could materially affect security,
authentication, user data, financial operations, persistent integrity,
availability, deployment, architectural boundaries, or broad cross-cutting
behavior. Routine bounded changes may rely on deterministic verification and
coordinator review. Campaign membership does not change this classification.

```text
[review]
Verdict: SHIP | FIX_FIRST | RETHINK
Issue: #<number>   Run: <run-id>
Mode: full | delta
Candidate: <expected and observed identity>
Fixed point: <full commit>
Checks: <commands and results>
Findings: <stable ID, evidence, severity, violated rule/requirement, acceptance condition>
Follow-up: <none | correction Task | escalation/re-plan>
```

`SHIP` permits integration after the other gates only for that candidate.
`FIX_FIRST` blocks integration, routes a correction Task containing the stable
finding IDs to an implementer, reruns affected checks, and uses delta review of
the corrected snapshot unless scope or risk expands. Two equivalent blocking
rounds pause for a coordinator decision instead of starting a third cycle.
`RETHINK` stops implementation and integration until the requirement or
architecture is made explicit.

## Candidate receipt and coordinator checkpoint

For a committed candidate, record its full commit and tree IDs. For WIP, record
the fixed base and reproducible SHA-256 capture of all committed-comparison,
staged, unstaged, and untracked bytes by running
`node .agents/scripts/candidate-id.mjs <fixed-point>`. The coordinator owns the
receipt and recomputes identity immediately before integration.

Before replacing or compacting a materially full coordinator context, record a
bounded durable checkpoint containing Issue/Run, objective and route, settled
decisions, completed/pending Tasks, candidate identity, open finding IDs,
verification state, next action, and known risks. Always checkpoint at a
Campaign Issue boundary. Resume the same logical ownership and Run from the
checkpoint and canonical artifacts, never from a copied transcript.

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
