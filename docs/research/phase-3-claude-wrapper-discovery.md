# Phase 3 Claude wrapper discovery

Status: live probe passed on Claude Code 2.1.236 on 2026-08-26.

## Research question

Does Claude Code reliably execute a project skill whose
`.claude/skills/<name>/SKILL.md` is only a lightweight wrapper pointing to the
canonical `.agents/skills/<name>/SKILL.md` body?

This result decides whether Phase 3 can generate lightweight Claude wrappers or
must inline each canonical skill body into the Claude discovery tree.

## Primary-source findings

- Claude Code discovers project skills at
  `.claude/skills/<skill-name>/SKILL.md`. It loads the invoked `SKILL.md` body as
  one conversation message.
- Claude Code supports additional files, but the skill body must reference them
  and tell Claude when to load them. They are loaded on demand rather than
  automatically inserted with the skill.
- The Agent Skills specification says file references should be relative to the
  skill root and recommends keeping reference chains one level deep.
- Therefore a wrapper can ask Claude to read another file, but an external
  `../../../.agents/...` pointer is not itself a portable Agent Skills contract.
  Whether Claude Code follows it reliably remains an empirical question.

Sources:

- [Claude Code: Extend Claude with skills](https://code.claude.com/docs/en/skills)
  (`Where skills live`, `Add supporting files`, and `Skill content lifecycle`).
- [Agent Skills specification](https://agentskills.io/specification)
  (`Directory structure`, `Progressive disclosure`, and `File references`).
- Local CLI help from Claude Code `2.1.236` (`claude --help`).

## Probe design

The isolated fixture was created temporarily at
`.tmp-claude-wrapper-test/` and had:

- a wrapper at `.claude/skills/wrapper-probe/SKILL.md`;
- a canonical body at `.agents/skills/wrapper-probe/SKILL.md`;
- a sentinel response present only in the canonical body;
- direct `/wrapper-probe` invocation in a fresh non-persistent session;
- only the `Read` tool enabled and `dontAsk` permission mode.

The intended command is:

```bash
claude -p '/wrapper-probe' \
  --model sonnet \
  --effort low \
  --tools Read \
  --permission-mode dontAsk \
  --setting-sources project \
  --no-session-persistence \
  --output-format json
```

Acceptance requires the exact sentinel response in three fresh sessions. A
separate control invocation verifies authentication before interpreting probe
failures as wrapper behavior.

## Live evidence

An initial probe and wrapper-independent control stopped before inference while
the local OAuth session was expired:

```text
Failed to authenticate: OAuth session expired and could not be refreshed
```

Both reported zero API duration, zero input/output tokens, and zero cost. After
the user re-authenticated, the wrapper-independent control reached inference
and returned exactly `AUTH_OK`.

Three fresh, non-persistent `/wrapper-probe` sessions then returned exactly:

```text
ORCA_CANONICAL_BODY_8D2F6A
ORCA_CANONICAL_BODY_8D2F6A
ORCA_CANONICAL_BODY_8D2F6A
```

The sentinel occurred only in the canonical `.agents` body, not in the wrapper.
Each probe took two model turns, had no permission denials, and completed with
the `Read`-only tool restriction. This is direct evidence that Claude Code
2.1.236 discovered the project wrapper and followed its external canonical-body
reference in all three tested sessions.

The authentication control and three probes reported a combined API-equivalent
cost of approximately USD 0.131. Their usage showed independent per-session
model work with prompt-cache reuse; the test therefore also illustrates why
multiple workers or sessions consume more inference than one coordinator path.

## Accepted decision

Accepted by the product owner on 2026-08-26: Phase 3 will generate small
`.claude/skills/<name>/SKILL.md` wrappers that explicitly instruct Claude to
read the canonical `.agents` body. The compatibility contract records a minimum
supported Claude Code version and retains an inline fallback if a future probe
fails.

The external reference remains outside the portable Agent Skills file-reference
convention, so this is a Claude Code compatibility contract rather than an
assumption about every Agent Skills implementation.
