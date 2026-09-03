# Orca execution reference

`AGENTS.md` defines the invariants and `docs/agents/execution-policy.md` defines
the rules: classification, budgets, continuation envelopes, failure taxonomy,
verification scope, context contract, checkpoints, candidate identity, review,
and resource reconciliation. This document is the operational checklist and the
record formats for moving from a request or GitHub Issue to an integrated,
finalized change. It does not restate the rules; when a step says "per policy",
the execution policy governs.

Classify before creating lifecycle objects. A direct trivial route executes
with targeted verification and no fabricated Issue, Run, Task, worker, or
reviewer. The remaining sections apply when the selected route or existing
durable ownership requires them.

## Run types

- **Planning Run (optional):** explores, researches, or shapes a proposal. It
  may publish an Issue body or decision record but never claims the Issue or
  authorizes implementation.
- **Issue-owned execution Run:** starts when an implementation Issue is
  claimed. It owns every Task, Dispatch, gate, correction, review, and the
  integration handoff for that Issue. Exactly one per claimed Issue.

`$campaign` is an explicit runtime authorization over a fixed ordered Issue
set; each member keeps its own execution Run. Its preflight, record, and
lifecycle live in `.agents/skills/campaign/`.

## Issue-to-Run checklist

```text
[ ] Classify shape, risk, uncertainty, and locality; record the minimum route.
[ ] Read the Issue body, comments, relevant domain docs/ADRs, and linked dependencies.
[ ] If needed, keep exploration in a separate Planning Run.
[ ] Claim the implementation Issue: gh issue edit <n> --add-assignee @me
[ ] Bind or create its one execution Run and record the Issue number.
[ ] Choose the current, child, or top-level worktree (table below).
[ ] Create bounded Tasks with acceptance, verification, and escalation rules.
[ ] Declare Orca Task dependencies; keep cross-Issue blockers in GitHub.
[ ] Dispatch only ready Tasks; wait for completion, questions, or escalations.
[ ] Run implementation, verification, and risk-required review gates.
[ ] Revalidate candidate identity and its receipt.
[ ] Integrate with one coordinator-owned commit; prove containment in the target.
[ ] Reconcile Issue-owned workers, terminals, worktrees, and temporary branches.
[ ] Record resource disposition and evidence in the Issue; close it.
[ ] In an active Campaign, execute the next-member actions unless a stop applies.
```

Record the transition in the Run:

```text
Issue: #<number> — <title>
Planning Run: <id or none>
Execution Run: <id>
Coordinator/integrator: <name or terminal>
Worktree/branch: <path> / <branch>
Route: direct | single-worker | task-dag | decision-first
Classification: <shape/risk/uncertainty/locality>
Verification/review: <scope> / <mode>
Budgets: workers <n>; blocking review rounds <n>; direct corrections <n>; remote runs <n>
Routing: <role → model/effort, per docs/agents/routing.md>
GitHub blockers: #<issue>, #<issue> | none
Orca Task blockers: <task-id> -> <task-id> | none
```

## Task and Dispatch contract

Every Task must be executable from its contract alone:

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

Implementation Tasks require a claimed Issue and its single execution Run.
Planning/evidence Tasks belong to a Planning Run or coordinator planning
context. Both need bounded scope, non-overlap with active writers, correct
dependencies, and the context contract from the execution policy. A worker
completion is a report, not acceptance.

## Event transitions

| Event | Required action |
| --- | --- |
| Grilling approved | Record settled vocabulary and unresolved items; draft a spec only when explicitly requested or already authorized. |
| Full spec approved | Publish one non-executable umbrella/spec Issue; draft tickets only when explicitly requested or already authorized. |
| Ticket breakdown approved | Create durable implementation Issues, blockers, verification, and labels; do not create workers or Runs because tickets exist. |
| Implementation Issue begins | Claim, bind/create its one execution Run, choose the worktree, create the minimum Task DAG, dispatch ready Tasks. |
| Verification fails | Classify per policy (recurrence, downstream, infrastructure, scope). Repair a new low-risk harness defect directly only inside the continuation envelope; otherwise pause or create a correction Task. |
| Review returns `FIX_FIRST` | Keep integration blocked; create a correction Task in the same Run with the stable finding IDs; rerun affected checks; delta review unless scope/risk expanded. Pause after two equivalent blocking rounds. |
| Review returns `RETHINK` | Pause immediately for an architecture or requirement decision; never retry. |
| Worker escalates | Pause the dependent path, record the decision, update the contract before redispatching or cancelling. |
| Candidate contained in target | Reconcile every Issue-owned resource using the policy proof rules; retain and pause on unique bytes or uncertain ownership. |
| Resources reconciled | Record `removed`, `retained`, or `not-created`; close the Issue. In an active Campaign, execute `add-ready-for-agent` and `start-issue` for the next eligible member unless a stop applies. |

Moving into a new product phase is automatic only when the user explicitly
authorized that end-to-end flow. Otherwise complete the current action, present
the result, and wait.

## Gate record

Post gate results to the Issue using `docs/agents/issue-tracker.md` tags:

```text
Gate: pre-dispatch | implementation | verification | review | integration | finalization
Issue: #<number>   Run: <run-id>   Task(s): <task-id(s)>
Candidate: <commit-and-tree or WIP snapshot SHA-256>
Evidence: <commands, report paths, or review link>
Result: PASS | BLOCKED | FAIL
Next action: <dispatch, correction Task, escalation, integration, resource reconciliation, frontier advance, or re-plan>
```

Pre-dispatch confirms Run type, Issue claim, bounded contracts, non-overlapping
ownership, dependencies, and worktree. Implementation confirms each report and
actual diff. Verification runs the exact commands and separates environment
limitations from product failures. Review checks the exact candidate.
Integration recomputes candidate identity before the commit. Finalization
records the disposition of every Issue-owned resource; integration success
alone does not satisfy it.

## Review record

Independent review is required when the policy's risk rules say so, never by
ritual. The reviewer is read-only and receives the Issue/spec, exact candidate,
diff, relevant source, and verification results.

```text
[review]
Verdict: SHIP | FIX_FIRST | RETHINK
Issue: #<number>   Run: <run-id>
Mode: full | delta
Candidate: <expected and observed identity>
Fixed point: <full commit>
Checks: <commands and results>
Findings: <stable ID, evidence, severity, violated rule/requirement, acceptance condition>
Follow-up: none | correction Task | escalation/re-plan
```

## Candidate receipt and checkpoint

Compute the candidate identity with
`node .agents/scripts/candidate-id.mjs <fixed-point>` and record the receipt
defined in the execution policy. Write the policy's coordinator checkpoint
before replacing or compacting a full coordinator context and at every Campaign
Issue boundary; resume from the checkpoint and canonical artifacts, never from
a copied transcript.

## Escalation

Use an Orca question for a bounded clarification the coordinator can answer.
Use an escalation when work is blocked or crosses worker authority:

```text
Type: question | escalation
Issue: #<number>   Run: <run-id>   Task: <task-id>
Trigger: <what was discovered>
Evidence: <file:line, command output, or linked decision>
Blocked action: <what cannot proceed safely>
Decision needed: <specific question>
Options/tradeoff: <known choices, if any>
Requested owner: coordinator | architectural authority
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
Final disposition: removed | retained | not-created
```

The coordinator owns staging, commits, merges, cherry-picks, pushes, and
conflict continuation. Remove an Orca-created worktree only under the policy's
proof rules, through Orca, and delete its local temporary branch only
afterwards. A remote branch requires separate authorization.
