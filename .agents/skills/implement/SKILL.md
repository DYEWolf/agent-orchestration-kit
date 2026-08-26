---
name: implement
description: "Implement a piece of work from an issue, specification, or bounded task using the Orca execution model."
---

# Implement

Implement the requested behavior while preserving the ownership and lifecycle rules in
`AGENTS.md`. Read `AGENTS.md` and, when present, `docs/agents/orca-execution.md` before
orchestrating work; those documents are canonical for routing, Runs, Tasks, Dispatches,
worktrees, verification, and release. This skill describes the procedure, not a second
copy of those rules or the Orca CLI manual.

## Choose the execution mode

Determine the mode from the prompt, before changing files:

- **Coordinator mode:** there is no live Dispatch preamble. The current session owns the
  user objective and may plan, dispatch, integrate, verify, and update the issue.
- **Worker mode:** the prompt contains a live Orca Dispatch/task preamble. The current
  session owns only that Task's contract and must report through that Dispatch.

Never infer coordinator authority from a request's size. A worker remains a worker even
when adjacent work looks useful.

## Coordinator mode

### 1. Bind work to its issue

1. Read the issue/spec and `docs/agents/issue-tracker.md`; identify the acceptance
   criteria, affected area, and the exact issue that owns the work.
2. Keep any explicitly authorized planning or evidence Run separate from execution; it
   may shape the proposal but does not claim the issue. Claim the implementation issue
   first, then create or bind exactly one issue-owned execution Run when implementation
   of that issue starts. Keep the issue, planning evidence, execution Run, and eventual
   integration evidence linked.
3. Inspect the current checkout and existing uncommitted changes. Preserve unrelated user
   work; make the scope explicit before assigning Tasks.

### 2. Build the minimum Task DAG

For every delegated Task, write an executable contract containing: objective, context,
owned files or modules, constraints, acceptance criteria, verification commands,
escalation conditions, and expected report. Then:

1. Split only where ownership and verification are genuinely separable. Create all
   independent read-only investigations or implementation Tasks before waiting on them.
2. Keep the DAG shallow and within the active-worker limit in `AGENTS.md`. Use a fresh
   worktree only when isolation is needed; use the current checkout when the task depends
   on its exact uncommitted state.
3. Select the model and effort from uncertainty and blast radius as prescribed by
   `AGENTS.md`. Do not encode routing policy in prose when Orca can enforce it.
4. Dispatch workers through Orca. A worker must never create a Run, Task, Dispatch, or
   nested worker of its own.

For a small, low-risk edit, the coordinator may work directly when delegation would add
more complexity than value. That exception does not remove the issue, verification, or
commit-ownership rules.

### 3. Integrate evidence, not promises

For each settled Task, inspect the actual diff and completion report. Confirm:

- each acceptance criterion has evidence;
- the diff stays inside the owned scope;
- the worker ran the requested checks and reported limitations;
- unresolved questions were answered or escalated through the Run;
- no worker created a commit, review, or side effect outside its contract.

Run deterministic checks appropriate to the change, normally focused tests and
`npx tsc --noEmit`, followed by the relevant full suite or production build. Do not call
an unverified prose report complete.

### 4. Review by risk

Review is a decision based on blast radius, not an automatic final phase. Invoke the
`code-review` procedure when a review is useful. Use the independent reviewer and risk
threshold defined by `AGENTS.md`; a normal, bounded, well-tested change may be accepted
with deterministic verification alone.

The reviewer is read-only and returns `SHIP`, `FIX_FIRST`, or `RETHINK`; it never fixes
the diff. A `FIX_FIRST` result creates a bounded correction Task. A `RETHINK` result
returns the decision to the coordinator before more code is written.

### 5. Close the issue and own integration

After verification and any required review:

1. Update the originating issue with the outcome, files, checks, review verdict, and
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
6. Finish with exactly one lifecycle completion report through Orca. Include files
   changed, summary, verification results, decisions, uncertainty, and intentionally
   undone work. Stop after that report.

## Implementation discipline

Prefer the smallest change at an existing seam. Add a regression test before a fix when
there is a correct seam, and explain when no such seam exists. Keep server-only imports
out of client-reachable modules, follow repository validation and data-model rules, and
preserve unrelated user changes. Do not leave debug instrumentation, secrets, generated
artifacts, or speculative abstractions in the diff.
