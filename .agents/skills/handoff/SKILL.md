---
name: handoff
description: Create a redacted, portable handoff for full ownership transfer or a bounded supervised Dispatch.
---

# Handoff

Read `AGENTS.md` and, when present, `docs/agents/orca-execution.md` for ownership and
Dispatch rules. A handoff is a durable orientation artifact, not a second copy of the
issue, plan, ADR, commit, or diff. Reference those artifacts by path or URL.

## Classify the handoff

Choose exactly one mode before writing:

- **Full ownership transfer:** the next session becomes responsible for the objective.
  Use Orca's ordinary handoff/worktree mechanism rather than creating a supervised Task
  or lifecycle obligation. Record any issue and prior Run/Task identity as provenance,
  then write the artifact for the new owner. Do not imply transfer merely by placing a
  file in `/tmp` or by starting another terminal.
- **Supervised Dispatch:** the coordinator remains owner and sends a bounded Task to a
  worker. Preserve the issue, Run, Task, and Dispatch context; the worker reports findings
  or changes back through its Dispatch. The artifact is supporting evidence, not an
  ownership transfer, and the worker must not create a new Run or pass the work onward.

If invoked inside a worker Dispatch, default to a supervised artifact unless the Task
explicitly authorizes a full transfer; ask the coordinator before changing ownership.

## Write a portable artifact

Resolve the operating system temporary directory (`$TMPDIR`, then `/tmp`, or the platform
equivalent) and create a fresh file such as
`<tmpdir>/orca-handoff-<timestamp>.md`. Never write the handoff into the repository by
default. Include:

```markdown
# Handoff: <objective>

## Mode
Full ownership transfer | Supervised Dispatch

## Next session focus
<the user's requested focus>

## Current state
<one paragraph: what is true now and why the next session starts here>

## Source artifacts
- Issue/spec: <path or URL>
- Plan/ADR: <path or URL, if applicable>
- Relevant diff/commit: <ref or path>
- Orca context: <Run/Task/Dispatch reference, if applicable>

## Completed
- <outcome with evidence>

## Remaining work
- <next concrete action>

## Decisions and constraints
- <decision, owner, or non-negotiable constraint>

## Verification
- `<command>` — <result or limitation>

## Risks, blockers, and uncertainty
- <specific issue or explicitly “none known”>

## Suggested skills
- <available skill or capability and why>
```

Keep it concise and avoid duplicating source artifacts. Include changed files only when
they are needed to orient the next session. State what was intentionally left undone.

## Redaction and portability checks

Before saving, replace secrets, tokens, passwords, credentials, authorization headers,
private keys, and unnecessary personal data with `<REDACTED>`. Remove machine-specific
assumptions where a path or command can be expressed portably. Do not embed terminal
transcripts containing unredacted environment values. Re-read the final file for secrets,
then report its absolute path and mode to the intended owner.

The handoff does not grant authority to edit, commit, review, or publish. Those actions
remain with the owner named by the mode and the canonical Orca lifecycle.
