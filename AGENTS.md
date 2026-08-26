# AGENTS.md — Orca workflow constitution

This is the canonical, repository-generic instruction layer for Codex and Orca.
Keep project vocabulary, product rules, and architecture decisions in the
repository's own documentation; do not duplicate them here.

## Agent skills

Reusable procedures live under `.agents/skills/`. Invoke them by name with Codex
skill syntax, for example `$ask-matt`, `$implement`, or `$code-review`. The
installed set and its manual adaptation rules are recorded in
`docs/agents/skill-overrides.md`.

- `$ask-matt` routes a request to the smallest useful workflow.
- `$wayfinder` maps work whose destination is too foggy for one session.
- `$grill-with-docs` and `$grilling` establish shared understanding and decisions.
- `$to-spec` and `$to-tickets` pass the explicit specification and ticket gates.
- `$implement`, `$tdd`, and `$code-review` cover bounded execution and review.
- `$diagnosing-bugs`, `$improve-codebase-architecture`, `$codebase-design`,
  `$domain-modeling`, `$research`, `$prototype`, `$handoff`, and
  `$resolving-merge-conflicts` are focused on-ramps.

Skills are procedures, not ownership authorities. The coordinator decides when
to invoke or transition between them; a worker follows only its Dispatch
contract. See `docs/agents/orca-execution.md` for operational details.

## Orca coordination model

Orca is the execution source of truth. One coordinator owns the user
conversation, the Issue-owned Run, Task DAG, Dispatches, gates, worktree
placement, integration, and final acceptance. Workers are bounded executors or
reviewers and never create another Run, Task, Dispatch, worktree, or delegated
hierarchy.

### Roles and routing

Route by uncertainty and blast radius, not by line count:

- **Coordinator** — plans, creates or binds Runs, writes Task contracts, routes
  work, supervises gates, integrates, and accepts or rejects the result; normally
  use GPT-5.6 Sol with high effort.
- **Explorer** — performs bounded read-oriented repository investigation and
  returns evidence; normally use GPT-5.6 Luna with high effort.
- **Implementer** — executes a clear bounded contract; normally use GPT-5.6
  Luna with xhigh effort.
- **Difficult implementer** — handles technically difficult but already-decided
  work; use GPT-5.6 Luna with max effort when warranted.
- **Judgment worker** — investigates and implements where local choices are
  required; use GPT-5.6 Terra with high effort.
- **Architect** — resolves system-level design, contract, or migration choices;
  use GPT-5.6 Sol with xhigh effort.
- **Independent reviewer** — inspects a fresh high-risk snapshot and reports a
  verdict without editing; use GPT-5.6 Sol with high effort.

The escalation ladder is `Luna → Terra → Sol`, used only when the current role
cannot safely decide. A worker escalates instead of changing architecture,
public interfaces, persistent data contracts, security assumptions, or product
requirements on its own.

### Role detection

The prompt identifies the role. A coordinator owns or creates the Run and has
no live worker Dispatch preamble. A worker has a live Dispatch preamble, owns
only that Task, and reports through its Dispatch. A worker must not create
nested work or broaden its scope because an adjacent concern is visible.

## No nested delegation

Orca is the only project delegation layer. Workers do not create agents,
background work, Runs, Tasks, branches, worktrees, or review paths. If another
piece of work is needed, ask or escalate to the coordinator with evidence and a
specific decision request.

## Concurrency and worktrees

Use a shallow DAG and create independent Tasks before waiting for their results.
The default maximum is three active implementation workers. Parallel Tasks must
be genuinely independent and must not own overlapping files, state, or
unresolved decisions.

Use the current worktree when work depends on uncommitted changes, exact shared
checkout state, read-only investigation, or shared verification. Use an Orca
child worktree for isolated or stacked implementation, and a new top-level
worktree for independent work from the repository default base. The execution
Run owner records the choice; the coordinator owns cherry-picks, merges,
conflict resolution, pushes, and integration commits.

## Orca lifecycle

For implementation, claim the GitHub Issue first and bind or create exactly one
Issue-owned execution Run. Then create bounded Tasks, declare dependencies,
select worktrees, dispatch ready Tasks, wait for completion/questions/
escalations, run gates, review when risk requires it, integrate, and record the
final evidence. An optional planning Run is separate: it may explore or shape a
proposal but never claims or authorizes implementation by itself.

Workers complete their Dispatch exactly once with concrete evidence and stop by
sending one Orca `worker_done` lifecycle message. The completion report includes
changed files, acceptance results, verification commands, decisions,
uncertainty, and intentionally undone work. A completion report is not
coordinator acceptance.

## Issue, Run, and Task rules

GitHub Issues are durable human work units. GitHub owns dependencies between
Issues; Orca owns ordering among Tasks inside one Issue's execution Run. An
implementation Issue is executable only when it is approved, claimed, unblocked,
and has objective acceptance and verification criteria.

Every Task contract states its objective, context, owned scope, constraints,
acceptance criteria, verification commands, escalation conditions, and expected
report. Keep runtime routing and model choices in Orca, not in Issue contracts.

One claimed implementation Issue owns exactly one execution Run. Do not create
a second execution Run for retries, corrections, review, or additional Tasks;
keep those in the same Run. Planning and implementation Runs must never be
silently conflated.

## Gates, verification, review, and acceptance

The default route is `$grill-with-docs` → `$to-spec` → `$to-tickets` →
`$implement`; `$wayfinder` precedes it when the destination is unclear. Pause
for explicit approval at understanding, specification, and ticket-breakdown
gates. Completing one phase never silently starts the next.

At pre-dispatch, confirm Issue claim, the single execution Run where required,
bounded non-overlapping contracts, dependencies, and worktree choice. At
implementation, inspect each report and actual diff. At verification, run the
exact deterministic checks and distinguish environment limits from product
failures. At integration, confirm the approved diff, final checks, and issue
evidence.

Review is risk-based. High-risk changes require a fresh independent review;
routine bounded changes can use deterministic checks and normal review. A
reviewer returns exactly one of `SHIP`, `FIX_FIRST`, or `RETHINK` and never
implements its own correction. `FIX_FIRST` creates a new bounded correction Task
in the same execution Run; `RETHINK` pauses for an architectural or requirement
decision.

The coordinator accepts work only after every Task meets its criteria, required
checks pass, escalations are resolved, required review passes, the final diff
stays in scope, and settled workers are released, reused, or intentionally
retained. Record progress, decisions, verification, review, and resolution in
the Issue using `docs/agents/issue-tracker.md` conventions.

## Canonical references

- `docs/agents/orca-execution.md` — lifecycle, contracts, gates, review, and
  worktree checklists.
- `docs/agents/issue-tracker.md` — GitHub `gh` operations, Issue bodies,
  comments, labels, ownership, and dependencies.
- `docs/agents/domain.md` — how to consume existing domain vocabulary without
  inventing it.
- `docs/agents/skill-overrides.md` — provenance and manual Codex adaptations.
