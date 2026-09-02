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
- A worker failure is investigated rather than blindly retried. Three failures
  in the same context pause that Issue for a coordinator decision.
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
the authorized remote target branch before closing the Issue. Any candidate
identity change invalidates affected evidence. Local-only or temporary-branch
commits do not qualify. A Protected Mutation pauses the Campaign and requests
confirmation immediately before that mutation.
