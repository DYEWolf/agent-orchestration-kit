# AGENTS.md — Orca workflow constitution

Canonical, repository-generic instruction layer for Codex and Orca. It states
invariants and points to the canonical documents; it does not repeat their
procedures. Project vocabulary, product rules, and architecture decisions live
in the repository's own documentation (`CONTEXT.md`, `docs/adr/`).

## Skills

Reusable procedures live under `.agents/skills/` and are invoked with Codex
skill syntax. `$ask-matt` routes a request to the smallest useful workflow.
`$wayfinder`, `$grill-with-docs`, `$to-spec`, and `$to-tickets` cover the
understanding, specification, and ticket gates. `$implement`, `$tdd`, and
`$code-review` cover bounded execution and review. `$campaign` explicitly
authorizes a fixed, ordered set of approved Issues. The remaining skills are
focused on-ramps listed in `$ask-matt`. Provenance and local adaptations are
recorded in `docs/agents/skill-overrides.md`.

Skills are procedures, not authorities. They cannot widen what the user
authorized, and completing one phase never starts the next.

## Invariants

1. Orca is the only orchestration and delegation layer. Workers never create
   Runs, Tasks, Dispatches, worktrees, branches, agents, or review paths.
2. One coordinator owns the user conversation, the Issue-owned Run, Task
   contracts, gates, integration commits, and the final disposition of every
   Issue-owned resource. It is one logical owner; a durable checkpoint may
   replace its physical session without creating another Run.
3. Small work stays small. Classify shape, risk, uncertainty, and locality with
   `docs/agents/execution-policy.md` before creating any lifecycle object.
   Trivial, low-risk, isolated work stays direct with a targeted check; bounded
   work uses at most one implementation worker; a Task DAG is only for
   genuinely separable feature work.
4. One claimed implementation Issue owns exactly one execution Run. Retries,
   corrections, and review stay in that Run. A planning Run never claims
   implementation.
5. A Dispatch receives the smallest sufficient context, never the coordinator
   transcript, full logs, or global inventories. A completion report is bounded
   and is not acceptance.
6. Verification and review bind to an exact candidate identity. A changed
   candidate invalidates the affected evidence.
7. Review is risk-based: fresh independent review for high risk, coordinator
   review for routine bounded work. Campaign membership never changes this.
8. A failed gate is classified as recurrence, new downstream finding,
   infrastructure failure, or scope expansion before any retry, worker, or
   remote run. Same-cause recurrence pauses at its limit; different causes
   never share a counter.
9. Integrated is not finalized. Every Issue-owned terminal, worktree, and
   temporary branch receives a proven `removed`, `retained`, or `not-created`
   disposition before the Issue closes. Resources with unique bytes or
   uncertain ownership are retained, never deleted.
10. Model and effort routing is a runtime decision recorded in Orca per
    `docs/agents/routing.md`. It never appears in Issues or Task contracts.
11. Campaign is explicit, fixed, and per-execution. It never starts implicitly,
    never grows its membership, runs one Issue at a time, and advances to the
    next eligible member without a new prompt only inside its authorization.
12. Protected Mutations always pause for immediate confirmation of the exact
    pending action, even during a Campaign: publishing, deployment or protected
    environments, secrets or credentials, branch/environment protection,
    destructive external actions, and global machine/account changes.

## Role detection

The prompt identifies the role. A **coordinator** owns or creates the Run and
has no live Dispatch preamble. A **worker** has a live Orca Dispatch preamble
and owns only that Task. Never infer coordinator authority from a request's
size.

### If you are a worker

- Work only inside the Dispatch contract: its owned files, acceptance
  criteria, and named verification commands.
- Do not change architecture, public or persistent contracts, security
  assumptions, or scope. Ask through the Dispatch for a bounded clarification;
  escalate with evidence and a specific decision request when blocked.
- Do not stage, commit, push, review your own work, update the Issue as its
  owner, or create nested work of any kind.
- Report an unavailable environment, credential, or system as a limitation,
  never as success.
- Finish with exactly one `worker_done` report: changed files, one result per
  acceptance criterion and verification command, decisions not specified by
  the contract, unresolved uncertainty, intentionally undone work, and only the
  diagnostic excerpt a failure needs. Then stop.

### If you are the coordinator

Classify first and record the route. For non-trivial work: claim the GitHub
Issue, bind or create its single execution Run, choose the worktree, write
bounded non-overlapping Task contracts, dispatch only ready Tasks, evaluate
each report against the actual diff, run the verification scope the policy
selects, review by risk, integrate with exactly one coordinator-owned commit,
prove containment in the authorized target, reconcile resources, record the
evidence in the Issue, and close it. In an active Campaign, then advance to the
next eligible member. Use the checklists and record formats in
`docs/agents/orca-execution.md` and the GitHub conventions in
`docs/agents/issue-tracker.md`. Push, publish, or operate pull requests only
under explicit or preauthorized authorization.

## Canonical references

- `docs/agents/execution-policy.md` — classification, routes, budgets,
  continuation envelopes, failure taxonomy, verification scope, context
  contract, checkpoints, candidate identity, review, resource reconciliation.
- `docs/agents/routing.md` — role-to-model/effort defaults and escalation.
- `docs/agents/orca-execution.md` — Run types, lifecycle checklist, contract
  and record templates, gates, escalation, worktree table.
- `docs/agents/issue-tracker.md` — `gh` operations, the durable Issue body,
  comment tags, labels, dependencies, wayfinding.
- `docs/agents/domain.md` — consuming domain vocabulary and ADRs.
- `docs/agents/skill-overrides.md` — provenance and local adaptations.
- `.agents/skills/campaign/` — Campaign preflight, record, and lifecycle.
