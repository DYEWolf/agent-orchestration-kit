---
name: campaign
description: Start, inspect, pause, resume, or cancel an explicitly authorized fixed set of GitHub implementation Issues. Use only when the user explicitly invokes Campaign.
---

# Campaign

Campaign is a bounded runtime authorization, not a permanent execution mode,
backlog runner, or replacement for Issue-owned Runs. It never starts implicitly.
Use it only for the user's natural-language intent to start, inspect/status,
pause, resume, or cancel a Campaign.

## Start

Ask for an explicit ordered list of implementation Issues. Run read-only,
atomic preflight before asking any optional permission: each member must be an
approved, executable Issue with complete acceptance and verification; a blocked
member may remain a fixed future member. Reject the entire proposal for any
invalid, duplicate, conflicted, or incomplete member, with no effects.

On success, present the complete proposed authorization and ordered frontier.
Choose the record anchor from the read-only parent/umbrella facts: a common
existing umbrella is the default, otherwise the first member is the default.
An explicit alternate is valid only when it is one of the provided relevant
existing anchors; it need not be a member. Ask only for relevant optional
Preauthorized Mutations: pushing integration commits, creating/updating
branches, creating/updating/merging pull requests when the pull-request route
is selected, and triggering/rerunning remote workflows only when a selected
Issue requires one. Reject irrelevant permission requests before any effect.
After the final needed answer, append the immutable Campaign Record comment to
the anchor Issue and immediately start the authorized work; do not ask a second
confirmation. Read [preflight and record details](references/preflight-and-record.md)
when constructing or validating that proposal.

## Operate

Reconstruct status from GitHub and Orca; do not mutate a Campaign status ledger.
Advance one Campaign Issue at a time, while each Issue preserves its own single
execution Run and its normal Task DAG. Read [lifecycle details](references/lifecycle.md)
before handling a gate, failure, review result, acceptance, pause, resume, or
cancel request.

Protected Mutations always require immediate confirmation, even during an active
Campaign. Keep an outstanding Protected Mutation pause tied to exactly the
pending mutation; a later confirmation cannot revive a cancelled or completed
Campaign. An Issue-local `RETHINK` creates an Issue Pause, while a transversal
`RETHINK` creates a Campaign Pause; neither is retried. Internal Task
dispatch is limited only inside the active Issue by the inherited worker limit,
and does not gate starting the next Issue when no Issue is active.

Cancellation stops new work, marks every unaccepted member cancelled, releases
Campaign-owned terminals and child-worktree resources, unassigns unaccepted
Issues, and records incomplete progress/evidence. Accepted commits/evidence are
preserved and no rollback is performed. Isolated execution uses fresh worker
terminals and child worktrees by default; use the current worktree only when
exact shared state or shared verification requires it. Acceptance requires
verification, required `SHIP`, exactly one coordinator-owned integration
commit, revalidated target identity, and containment in the authorized remote
target branch; local-only or temporary-branch commits do not qualify.

Manual Issue execution remains the default; `$to-tickets` publishes issues and
stops, and `$campaign` is the only route that starts Campaign work. This
bootstrap deliberately excludes Issue #16 productization: no distributed
catalog/generated artifact, public CLI/configuration/runtime adapter, GitHub
mutation, or Orca mutation is added by the dogfood plan.
