---
name: resolving-merge-conflicts
description: Resolve an in-progress git merge or rebase while preserving intent and explicit commit ownership.
---

# Resolving Merge Conflicts

Read `AGENTS.md` and, when present, `docs/agents/orca-execution.md` before deciding who
may finish the integration. Conflict resolution is a source-and-evidence task, not a
reason to create nested workers or invent behavior.

## Establish state and ownership

1. Inspect the merge/rebase state, `git status`, history, and every conflicted file.
2. Determine whether the current session is coordinator mode or a live Dispatch worker.
3. In coordinator mode, the coordinator owns the merge/rebase state and final integration
   commit. If the conflict set is large, dispatch read-only intent-gathering Tasks with
   non-overlapping scopes; do not let separate workers edit the same hunk.
4. In worker mode, work only on the files and hunks explicitly assigned. The worker may
   inspect sources and apply bounded hunk resolutions when the contract authorizes it,
   but must not stage, commit, push, run merge/rebase continuation, abort the operation,
   or claim final integration. Report unresolved conflicts through the Dispatch.

## Find both intents

For each side of each conflict, inspect the originating commit, nearby history, the
originating issue/spec, and relevant ADRs. Use `docs/agents/issue-tracker.md` for issue
lookup. Record the purpose of both changes before editing. Prefer a resolution that
preserves both intents; where they are incompatible, select the behavior matching the
stated merge/rebase goal and record the trade-off for the coordinator.

## Resolve conservatively

Resolve one hunk at a time. Do not blindly choose ours/theirs, discard a side without
evidence, or introduce new behavior to make the markers disappear. Keep the diff narrow,
preserve formatting and generated-file policy, and leave no conflict markers. If the
resolution changes an interface, persistent data, security assumption, or architectural
decision, stop and escalate rather than improvising.

Never abort a merge or rebase as a shortcut. An explicit user instruction to abandon the
operation is outside this procedure and must be handled as a separate, destructive
action.

## Verify and finish under the owner

Discover the repository's checks and run the relevant deterministic sequence: focused
tests or typechecking first, then broader tests/build/format as appropriate. Redact
secrets in logs and report unavailable external checks. Reinspect the complete diff for
both preserved intents and unintended scope.

Only the coordinator may stage the resolved files and continue or complete the merge or
rebase, then create the integration commit on the owned branch. A worker reports files,
hunk decisions, checks, unresolved uncertainty, and intentionally undone work; it sends
one Dispatch completion report and stops. The coordinator then owns final verification,
issue updates, risk-based review, and commit lifecycle.
