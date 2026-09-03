# Campaign lifecycle

Reconstruct the Campaign from the fixed authorization, Issue states/comments,
and Issue-owned Orca Runs. Resume binds the stable Campaign identity, reuses the
immutable Campaign Record and existing Issue-owned Runs, and never creates a
replacement Run. Use fresh worker
terminals and child worktrees by default for isolated execution, retaining the
current worktree only for exact shared state or verification. A Campaign may
have one active Issue and preserves the configured internal worker limit inside
that Issue. A newly unblocked fixed future member becomes eligible in
authorization order, emits `add-ready-for-agent`, and only then starts; no newly
discovered Issue can join.

- **Issue Pause** blocks one Issue and lets another independent fixed member run.
- **Campaign Pause** stops all progression when a shared/transversal decision is
  needed or no independent work remains. Issue-local `RETHINK` creates an Issue
  Pause; transversal `RETHINK` creates a Campaign Pause, and neither is
  retried.
- When an Issue Pause clears the active Issue and no independent authorized
  member is ready, the Campaign becomes paused and emits an observable
  `pause-campaign` action with the no-independent-work reason.
- Resolve an `issue-paused` member only through an explicit
  `issue-pause-resolved` event backed by reconstructed evidence of its existing
  Issue-owned Run. It emits `resolve-issue-pause` with that same Run identity,
  returns the member to `ready` or `future` based on blocker evidence, and
  schedules it only when no other Issue is active. A generic `resume-requested`
  waits while a no-independent-work Campaign Pause still contains an
  `issue-paused` member; transversal, Protected Mutation, and unrelated pauses
  cannot be resolved through this route.
- Internal Task concurrency is enforced only for `task-ready` dispatches on the
  active Issue. Worker capacity never gates starting a next Issue when none is
  active.
- A worker or verification failure is investigated rather than blindly retried.
  Three recurrences of the same stable execution finding pause that Issue for a
  coordinator decision. A different failure in a newly reached downstream
  stage receives a new ID and does not inherit the resolved finding's counter.
  When the Campaign Record or later explicit decision provides a bounded
  continuation envelope, the coordinator may repair new deterministic,
  low-risk test/build/CI harness defects directly within its named surfaces and
  budgets; this creates no correction Task or implementation worker.
- `FIX_FIRST` creates a bounded correction Task in that Issue's existing Run.
  Preserve stable finding IDs and use delta review when the correction remains
  confined to them; expand to full review if scope or risk changes. Two
  equivalent blocking review rounds pause the Issue for a coordinator decision.
  `RETHINK` pauses for an architecture or requirement decision and is never
  retried.
- A Protected Mutation pauses with the exact pending mutation and confirmation
  can execute only that mutation; confirmation cannot revive a cancelled or
  completed Campaign.
- Resume reuses the existing immutable record and reconstructs current state.
  Cancel stops new work, marks every unaccepted member cancelled, releases
  Campaign-owned terminals and child-worktree resources, unassigns unaccepted
  Issues, and records incomplete progress/evidence. Accepted commits/evidence
  remain intact; cancellation performs no rollback.

Classify review per Issue; Campaign membership alone never requires it. Write
the execution-policy coordinator checkpoint at every Issue boundary before
starting the next member.

An Issue becomes accepted only after candidate-bound verification,
candidate-bound `SHIP` when review is required, exactly one coordinator-owned
integration commit, trustworthy revalidated target identity, and containment in
the authorized remote target branch. Any candidate identity change invalidates
affected evidence. Local-only or temporary-branch commits do not qualify.

After containment, finalize the Issue in this order, applying the resource
reconciliation proof rules in `docs/agents/execution-policy.md`:

1. Confirm all Issue-owned Dispatches are settled and release, reuse, or
   explicitly retain their worker terminals.
2. Remove each Issue-owned Orca worktree through Orca only when the policy's
   proof conditions hold; delete its local temporary branch only afterwards.
   A remote branch needs its own explicit or preauthorized mutation.
3. If unique bytes or uncertain ownership remain, retain the resource, record
   its exact identity and recovery action, and pause Issue finalization.
4. Record `removed`, `retained`, or `not-created` in the resolution evidence,
   close the Issue, and record Campaign acceptance.
5. Execute the next actions emitted by the fixed frontier: add
   `ready-for-agent` to the next newly eligible member when needed, then start
   that Issue. Do not wait for another prompt unless the user explicitly set a
   boundary or a normal pause/authorization condition applies.

A Protected Mutation pauses the Campaign and requests confirmation immediately
before that mutation. Reconciliation never rolls back accepted commits or
evidence and never treats successful integration alone as deletion proof.
