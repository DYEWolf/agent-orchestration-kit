---
name: implement
description: "Implement a piece of work from an issue, specification, or bounded task using the Orca execution model."
---

# Implement

Implement the requested behavior under the ownership rules in `AGENTS.md`. The
rules for classification, budgets, context, verification, review, candidate
identity, and resource reconciliation live in `docs/agents/execution-policy.md`;
the checklists and record formats live in `docs/agents/orca-execution.md`; the
GitHub conventions live in `docs/agents/issue-tracker.md`. This skill is the
procedure that applies them. It does not restate them.

## Choose the mode

Determine the role from the prompt before changing files, per the role
detection rules in `AGENTS.md`. A worker follows the worker rules there and the
"Worker mode" section below; everything else is coordinator mode.

## Coordinator mode

1. **Classify and route.** Record the route decision from the execution policy.
   For an authorized end-to-end outcome or a resumed gate, also record the
   continuation envelope. Keep any planning or evidence Run separate from
   execution.
2. **Direct route.** If the route is direct, confirm no risk disqualifier
   applies, inspect the checkout, make the smallest local change, run the
   targeted check, and stop. Do not fabricate an Issue, Run, Task, worker, or
   reviewer. Preserve durable ownership if the work is already Issue-owned.
3. **Bind the work.** Otherwise read the Issue body and comments, identify the
   acceptance criteria and owned area, claim the Issue, and bind or create its
   single execution Run. Inspect existing uncommitted changes and make the
   scope explicit before assigning Tasks.
4. **Build the minimum Task DAG.** Split only where ownership and verification
   are genuinely separable; bounded work gets at most one worker. Write each
   contract with the template in `docs/agents/orca-execution.md` and the
   context contract in the policy. Create independent Tasks before waiting on
   any of them. Choose the worktree from the decision table. Dispatch through
   Orca.
5. **Integrate evidence, not promises.** For each settled Task, inspect the
   actual diff and the completion report: evidence per acceptance criterion,
   diff inside the owned scope, requested checks run with limitations
   reported, questions answered or escalated, no commit or side effect outside
   the contract. Run the verification scope the route selected; do not run a
   full suite by ritual.
6. **Classify any failure before spending more.** Apply the failure taxonomy
   and continuation-envelope rules from the policy. A new deterministic
   low-risk harness defect may be repaired directly only inside the recorded
   envelope. Use progressive remote verification and one representative log
   for identical matrix failures.
7. **Review by risk.** Perform coordinator acceptance against the actual diff.
   Invoke `$code-review` only when the route or the user requires it. Freeze
   and record the candidate identity first. Handle `FIX_FIRST`, delta review,
   the two-round pause, and `RETHINK` exactly as the policy states.
8. **Integrate and finalize.** Recompute candidate identity and invalidate
   affected evidence if it changed. Record the receipt and update the Issue
   with outcome, files, checks, verdict, finding IDs, and limitations. Stage
   and commit as the coordinator with exactly one integration commit; push or
   publish only under explicit or preauthorized authorization. Prove
   containment in the authorized target, then reconcile every Issue-owned
   terminal, worktree, and temporary branch under the policy's proof rules and
   record `removed`, `retained`, or `not-created` before closing the Issue. In
   an active Campaign, then execute the next-member actions unless a stop or
   pause applies.

## Worker mode

1. Read the live Dispatch contract and only the context its owned scope needs.
2. Work only on the assigned files and acceptance criteria. Do not redesign,
   broaden, or fix adjacent defects without coordinator approval.
3. Run the named verification and report exact commands and results; report an
   unavailable environment as a limitation.
4. Ask through the Dispatch when a requirement is ambiguous; escalate when the
   work would change architecture, a public interface, a persistent contract, a
   security assumption, or the Task's scope.
5. Never create or bind a Run, launch another worker, review your own work,
   stage or commit, or update the Issue as owner.
6. Finish with exactly one `worker_done` report in the format `AGENTS.md`
   requires, then stop.

## Implementation discipline

Prefer the smallest change at an existing seam. Add a regression test before a
fix when a correct seam exists, and say so when none does. Keep server-only
imports out of client-reachable modules, follow repository validation and
data-model rules, and preserve unrelated user changes. Leave no debug
instrumentation, secrets, generated artifacts, or speculative abstractions in
the diff.
