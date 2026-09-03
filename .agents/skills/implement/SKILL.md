---
name: implement
description: "Implement a piece of work from an issue, specification, or bounded task using the Orca execution model."
---

# Implement

Implement the requested behavior while preserving the ownership and lifecycle rules in
`AGENTS.md`. Read `AGENTS.md`, `docs/agents/execution-policy.md`, and, when present,
`docs/agents/orca-execution.md` before orchestrating work; those documents are
canonical for classification, routing, Runs, Tasks, Dispatches, context, verification,
review, and release. This skill describes the procedure, not a second copy of those
rules or the Orca CLI manual.

## Choose the execution mode

Determine the mode from the prompt, before changing files:

- **Coordinator mode:** there is no live Dispatch preamble. The current session owns the
  user objective and may plan, dispatch, integrate, verify, and update the issue.
- **Worker mode:** the prompt contains a live Orca Dispatch/task preamble. The current
  session owns only that Task's contract and must report through that Dispatch.

Never infer coordinator authority from a request's size. A worker remains a worker even
when adjacent work looks useful.

## Coordinator mode

### 1. Classify and bind the work

1. Classify shape, risk, uncertainty, and locality. Record the route, verification,
   review, worker budget, and blocking-review budget required by the execution policy.
   For an authorized end-to-end or resumed gate, also record a continuation envelope:
   owned surfaces, allowed correction classes, direct/worker/remote budgets, authorized
   external actions, and stop conditions.
2. For a direct trivial route, confirm there is no risk disqualifier, inspect the
   checkout, make the smallest local change, and run the targeted check. Do not create
   an Issue, Run, Task, worker, or reviewer solely to satisfy ceremony. If the work is
   already Issue-owned, retain that durable ownership.
3. For every other route, read the issue/spec and `docs/agents/issue-tracker.md`;
   identify the acceptance criteria, affected area, and exact issue that owns the work.
4. Keep any explicitly authorized planning or evidence Run separate from execution; it
   may shape the proposal but does not claim the issue. Claim the implementation issue
   first, then create or bind exactly one issue-owned execution Run when implementation
   of that issue starts. Keep the issue, planning evidence, execution Run, and eventual
   integration evidence linked.
5. Inspect the current checkout and existing uncommitted changes. Preserve unrelated user
   work; make the scope explicit before assigning Tasks.

### 2. Build the minimum Task DAG

For every delegated Task, send the smallest sufficient executable contract: objective,
acceptance criteria, owned files or modules, constraints, selected evidence pointers,
verification commands, escalation conditions, and expected bounded report. Never inject
the raw coordinator transcript, complete logs, or global Run/worker inventories. Then:

1. Split only where ownership and verification are genuinely separable. Create all
   independent read-only investigations or implementation Tasks before waiting on them.
2. Keep the DAG shallow and within the active-worker limit in `AGENTS.md`. Use a fresh
   worktree only when isolation is needed; use the current checkout when the task depends
   on its exact uncommitted state.
3. Respect the worker and reasoning budgets in the execution policy. Select the model and
   effort from uncertainty and blast radius; do not use `xhigh` or `max` without a
   recorded difficulty that requires it. Do not encode routing policy in prose when Orca
   can enforce it.
4. Dispatch workers through Orca. A worker must never create a Run, Task, Dispatch, or
   nested worker of its own.

Bounded work uses at most one implementation worker. Create a Task DAG only when the
work has genuinely separable ownership and verification.

### 3. Integrate evidence, not promises

For each settled Task, inspect the actual diff and completion report. Confirm:

- each acceptance criterion has evidence;
- the diff stays inside the owned scope;
- the worker ran the requested checks and reported limitations;
- unresolved questions were answered or escalated through the Run;
- no worker created a commit, review, or side effect outside its contract.

Run the targeted, module, or full deterministic checks selected by the execution policy.
Do not run a full suite by ritual when focused evidence is sufficient, and do not call an
unverified prose report complete.

If verification fails, classify it before creating work: recurrence of the same finding,
a newly reachable downstream finding, infrastructure failure, or scope expansion. A new
deterministic low-risk test/build/CI harness finding may be corrected directly by the
coordinator only when it is inside the recorded continuation envelope. Use progressive
remote verification and inspect one representative log for identical matrix failures.
Do not spend another worker, reviewer, or complete remote run merely because a gate is
red.

### 4. Review by risk

Review is a decision based on risk and blast radius, not an automatic final phase. First
perform coordinator acceptance against the actual diff. Invoke the `code-review`
procedure when the recorded route or user requires it. Campaign membership alone does
not require review; a normal, bounded, well-tested change may be accepted with
deterministic verification and coordinator review alone.

Before independent review, freeze and record the candidate identity defined by the
execution policy. The reviewer is read-only and returns `SHIP`, `FIX_FIRST`, or
`RETHINK`; it never fixes the diff. Each blocking finding has a stable ID. `FIX_FIRST`
creates a bounded correction Task containing only those IDs and the required context,
then uses delta review unless the correction expands scope or risk. Two equivalent
blocking rounds pause for a coordinator decision instead of starting a third cycle.
`RETHINK` pauses immediately before more code is written.

### 5. Close the issue and own integration

After verification and any required review:

1. Recompute the candidate identity and invalidate affected evidence if it changed.
   Record the candidate-bound verification/review receipt. When an originating Issue
   exists, update it with the outcome, files, checks, review verdict, finding IDs, and
   remaining limitations. Do not claim orchestration without the corresponding Run,
   Tasks, Dispatches, and reports.
2. Release, reuse, or explicitly retain every settled worker in Orca.
3. The coordinator owns staging and integration commits on the coordinator branch. Do
   not ask a worker to commit on the coordinator's behalf. Push or publish only when the
   user explicitly requested that external action.

## Worker mode

1. Read the live Dispatch contract and only the context needed for its owned scope.
2. Work only on the assigned files/modules and acceptance criteria. Do not redesign
   architecture, alter public or persistent contracts, broaden the issue, or resolve an
   adjacent defect without coordinator approval.
3. Run the verification named by the Task and report exact commands and results. If a
   required environment, credential, or external system is unavailable, report that
   limitation rather than treating it as success.
4. Ask the coordinator through the Dispatch when a requirement is ambiguous. Escalate
   when the work would change architecture, a public interface, a persistent data
   contract, a security assumption, or the Task's scope. Do not silently invent a
   requirement.
5. Never create or bind a Run, launch another worker, review its own work, stage or
   commit changes, or update the issue as if it were the owner. The coordinator decides
   integration, review, issue state, and commit ownership.
6. Finish with exactly one lifecycle completion report through Orca. Include changed
   files, one result per acceptance criterion and verification command, decisions,
   uncertainty, and intentionally undone work. Include only diagnostic excerpts needed
   for failures, never raw transcripts or complete logs. Stop after that report.

## Implementation discipline

Prefer the smallest change at an existing seam. Add a regression test before a fix when
there is a correct seam, and explain when no such seam exists. Keep server-only imports
out of client-reachable modules, follow repository validation and data-model rules, and
preserve unrelated user changes. Do not leave debug instrumentation, secrets, generated
artifacts, or speculative abstractions in the diff.
