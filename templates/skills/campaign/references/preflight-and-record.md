# Campaign preflight and record

Use read-only GitHub and Orca snapshots to validate the user-provided ordered
Issue list. Do not discover, add, reorder, claim, comment on, or create work
while preflighting. Validate objective, acceptance, constraints, risks/review,
and verification independently. A blocked member may omit `ready-for-agent`
when it is otherwise approved and complete; an unblocked member must carry the
label. It is represented as a future frontier member until its GitHub
dependencies clear. On resume, a reconstructed accepted member remains in
fixed membership as a terminal `accepted` frontier member and is never
eligible to start. A blocker included in fixed membership must precede its
dependent; an external open blocker is allowed and keeps the member future.

Reject the complete proposal when any member is missing, duplicated, closed
without reconstructed accepted evidence during resume, incomplete, unready
despite being unblocked, already owned by another assignee or active Campaign,
or when an active/paused Campaign Record conflicts. An
assignee matching the current Campaign coordinator is allowed. An existing
Issue-owned Run is allowed only for resume/reconstruction, never a new start.
A successful proposal fixes the membership forever and identifies its first
ready Issue plus future members (or terminal accepted members during resume).
The preflight remains atomic with `effects: []`.

Select the anchor from existing parent/umbrella facts: a common umbrella
defaults to that Issue; with no common umbrella, the first member defaults. An
explicit alternate must be one of the provided relevant existing anchors, and
the anchor need not be in fixed membership.

The anchor Issue receives exactly one immutable comment beginning:

```markdown
[decision] Campaign Record
<!-- orca-campaign-record:v1 -->
```

Its contents record: a stable Campaign identity; the ordered fixed membership and anchor; repository remote
identity and target branch; base revision and observed local mutations; selected
Preauthorized Mutations; the Protected Mutation policy; cross-Issue concurrency
of one; inherited internal worker limit; integration route; pause conditions;
stopping condition; and creation time. It is an authorization, not a mutable
progress log. Use existing `[progress]`, `[verification]`, `[review]`, and
`[resolution]` comments for later evidence.

Preauthorized Mutations are optional and must be relevant: pushing integration
commits; creating or updating branches; creating, updating, or merging pull
requests when the pull-request route needs them; and triggering or rerunning
remote workflows only when selected Issues require them. Requested permissions
that are irrelevant are rejected. Protected Mutations are never preauthorized:
publishing, deployment or protected-environment changes, secrets or credentials,
branch/environment protection, destructive external actions, and global
machine/account configuration.
