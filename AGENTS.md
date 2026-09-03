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
- `$campaign` explicitly authorizes a fixed Issue set for bounded coordinated execution.
- `$diagnosing-bugs`, `$improve-codebase-architecture`, `$codebase-design`,
  `$domain-modeling`, `$research`, `$prototype`, `$handoff`, and
  `$resolving-merge-conflicts` are focused on-ramps.

Skills are procedures, not ownership authorities. The coordinator decides when
to invoke or transition between them; a worker follows only its Dispatch
contract. Classify work with `docs/agents/execution-policy.md` before selecting
a procedure; see `docs/agents/orca-execution.md` for operational details.

Campaign never starts implicitly: manual execution remains the default and
`$to-tickets` stops after publication. A Campaign coordinates existing
Issue-owned Runs over its explicit fixed membership; it is not a persistent mode
or replacement Run.

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
  use GPT-5.6 Sol with high effort. It is one logical owner, but a bounded
  checkpoint may replace its physical session without creating another Run.
- **Explorer** — performs bounded read-oriented repository investigation and
  returns evidence; normally use GPT-5.6 Luna with high effort.
- **Implementer** — executes a clear bounded contract; normally use GPT-5.6
  Luna with high effort.
- **Difficult implementer** — handles technically difficult but already-decided
  work; use GPT-5.6 Luna with xhigh effort, and max only when the recorded
  difficulty warrants it.
- **Judgment worker** — investigates and implements where local choices are
  required; use GPT-5.6 Terra with high effort.
- **Architect** — resolves system-level design, contract, or migration choices;
  use GPT-5.6 Sol with xhigh effort.
- **Independent reviewer** — inspects a fresh risk-selected snapshot and reports
  a verdict without editing; use Terra with high effort for medium-risk judgment
  and GPT-5.6 Sol with high effort for high-risk work.

The escalation ladder is `Luna → Terra → Sol`, used only when the current role
cannot safely decide. A worker escalates instead of changing architecture,
public interfaces, persistent data contracts, security assumptions, or product
requirements on its own.

### Role detection

The prompt identifies the role. A coordinator owns or creates the Run and has
no live worker Dispatch preamble. A worker has a live Dispatch preamble, owns
only that Task, and reports through its Dispatch. A worker must not create
nested work or broaden its scope because an adjacent concern is visible.

### Classify before orchestrating

Classify shape, risk, uncertainty, and locality with
`docs/agents/execution-policy.md`, then record the minimum safe route. Trivial,
low-risk, low-uncertainty, isolated work stays direct: it requires no fabricated
Issue, Run, worker, or reviewer, but still requires a targeted deterministic
check. Bounded work uses at most one implementation worker. A Task DAG is for
genuinely separable feature work, and fresh independent review is reserved for
stated risks, always including high-risk changes. Campaign membership alone
does not change an Issue's review requirement.

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

For non-trivial implementation, claim the GitHub Issue first and bind or create
exactly one Issue-owned execution Run. Then create only the bounded Tasks the
selected route needs, declare dependencies, select worktrees, dispatch ready
Tasks, wait for completion/questions/escalations, run gates, review when risk
requires it, integrate, and record the final evidence. Direct trivial work uses
the repository-local change and targeted verification without manufacturing
lifecycle objects. An optional planning Run is separate: it may explore or
shape a proposal but never claims or authorizes implementation by itself.

Workers complete their Dispatch exactly once with concrete evidence and stop by
sending one Orca `worker_done` lifecycle message. The bounded completion report
includes changed files, one result per acceptance criterion and verification
command, decisions, uncertainty, and intentionally undone work. Do not return
raw transcripts or complete logs. A completion report is not coordinator
acceptance.

## Issue, Run, and Task rules

GitHub Issues are durable human work units. GitHub owns dependencies between
Issues; Orca owns ordering among Tasks inside one Issue's execution Run. An
implementation Issue is executable only when it is approved, claimed, unblocked,
and has objective acceptance and verification criteria. Do not create an Issue
solely to add ceremony to a direct trivial route.

Every Task contract states its objective, context, owned scope, constraints,
acceptance criteria, verification commands, escalation conditions, and expected
report. Keep runtime routing and model choices in Orca, not in Issue contracts.

One claimed implementation Issue owns exactly one execution Run. Do not create
a second execution Run for retries, corrections, review, or additional Tasks;
keep those in the same Run. Planning and implementation Runs must never be
silently conflated.

## Gates, verification, review, and acceptance

Classify first. The substantial-feature route is `$grill-with-docs` →
`$to-spec` → `$to-tickets` → `$implement`; use only the phases needed to remove
actual uncertainty. `$wayfinder` precedes it when the destination is unclear.
Pause for explicit approval at understanding, specification, and
ticket-breakdown gates. Completing one phase never silently starts the next.

At pre-dispatch, confirm Issue claim, the single execution Run where required,
bounded non-overlapping contracts, dependencies, and worktree choice. At
implementation, inspect each report and actual diff. At verification, run the
exact deterministic checks and distinguish environment limits from product
failures. At integration, confirm the approved diff, final checks, and issue
evidence.

A failed gate is diagnosed before choosing whether to continue. A newly exposed
downstream failure is not a retry of the finding that previously blocked that
stage. Within an explicitly recorded continuation envelope, the coordinator may
repair new deterministic, low-risk test/build/CI harness defects directly,
without manufacturing a correction Task or reviewer. Pause when the same
finding recurs, the envelope is exhausted, or the correction would cross into
product behavior, architecture, dependencies, security, or another excluded
surface. Direct correction must not remove coverage, weaken required evidence,
or relax acceptance criteria. Use the progressive remote-verification and
log-reading rules in `docs/agents/execution-policy.md`.

Review is risk-based. High-risk changes require a fresh independent review;
routine bounded changes can use deterministic checks and coordinator review. A
reviewer returns exactly one of `SHIP`, `FIX_FIRST`, or `RETHINK` and never
implements its own correction. Findings use stable IDs. `FIX_FIRST` creates a
bounded correction Task in the same execution Run, followed by delta review when
the correction remains confined to those IDs; expanding risk or scope requires
full review. Two equivalent blocking review rounds pause for a coordinator
decision. `RETHINK` pauses immediately for an architectural or requirement
decision.

The coordinator accepts work only after every Task meets its criteria, required
checks pass, escalations are resolved, required review passes, the final diff
stays in scope, and settled workers are released, reused, or intentionally
retained. Verification and review receipts bind to an exact candidate; any
candidate change invalidates affected evidence until it is rerun. Record
progress, decisions, candidate identity, verification, review, and resolution
in the Issue using `docs/agents/issue-tracker.md` conventions.

## Campaign authorization

A Campaign is an explicit, fixed, per-execution authorization for approved
implementation Issues. Its preflight is read-only and atomic; approved blocked
Issues may be future members without `ready-for-agent`, while unblocked members
must carry it. Validate objective, acceptance, constraints, risks/review, and
verification independently; an invalid member rejects the whole proposal
without effects. Cross-Issue concurrency is one, while the normal internal
worker limit applies only inside the sole active Issue.

Each Issue still owns exactly one execution Run. Review remains independently
risk-classified; Campaign membership never makes review mandatory. Use fresh
worker terminals and child worktrees by default unless exact shared state
requires the current worktree; workers never commit. Corrections stay in the
same Run, failures are investigated rather than blindly retried, two equivalent
blocking review rounds or three recurrences of the same execution finding pause
the Issue, and `RETHINK` is never retried. Sequentially exposed findings with
different causes do not share a recurrence counter.

Protected Mutations always need immediate confirmation: publishing,
deployment/protected environments, secrets/credentials, branch or environment
protection, destructive external actions, and global machine/account changes.
Issue-local `RETHINK` pauses one Issue; transversal `RETHINK` pauses the
Campaign. Cancellation stops new work, cleans Campaign-owned resources,
unassigns unaccepted Issues, records incomplete evidence, preserves accepted
evidence, and performs no rollback. An Issue is accepted only after
verification, `SHIP` when review is required, exactly one coordinator-owned
integration commit, trustworthy revalidated target identity, and containment in
the authorized remote target branch; local-only or temporary-branch commits do
not qualify.

## Canonical references

- `docs/agents/execution-policy.md` — task classification, worker/context
  budgets, verification scope, checkpoints, and candidate-bound review.
- `docs/agents/orca-execution.md` — lifecycle, contracts, gates, review, and
  worktree checklists.
- `docs/agents/issue-tracker.md` — GitHub `gh` operations, Issue bodies,
  comments, labels, ownership, and dependencies.
- `docs/agents/domain.md` — how to consume existing domain vocabulary without
  inventing it.
- `docs/agents/skill-overrides.md` — provenance and manual Codex adaptations.
