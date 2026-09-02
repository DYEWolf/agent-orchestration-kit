# Local skill provenance and overrides

The upstream engineering and productivity skills originate from
[`mattpocock/skills`](https://github.com/mattpocock/skills), pinned to commit
`6654f6b60cd9d5be8b54c6fafe44346dabeb3b76`. Their local copies under
`.agents/skills/` are manually maintained Codex adaptations, not a floating
upstream installation.

## Pinned upstream inventory

| Skill | Upstream path | Local path |
| --- | --- | --- |
| `ask-matt` | `skills/engineering/ask-matt/SKILL.md` | `.agents/skills/ask-matt/` |
| `code-review` | `skills/engineering/code-review/SKILL.md` | `.agents/skills/code-review/` |
| `codebase-design` | `skills/engineering/codebase-design/SKILL.md` | `.agents/skills/codebase-design/` |
| `diagnosing-bugs` | `skills/engineering/diagnosing-bugs/SKILL.md` | `.agents/skills/diagnosing-bugs/` |
| `domain-modeling` | `skills/engineering/domain-modeling/SKILL.md` | `.agents/skills/domain-modeling/` |
| `grill-with-docs` | `skills/engineering/grill-with-docs/SKILL.md` | `.agents/skills/grill-with-docs/` |
| `grilling` | `skills/productivity/grilling/SKILL.md` | `.agents/skills/grilling/` |
| `handoff` | `skills/productivity/handoff/SKILL.md` | `.agents/skills/handoff/` |
| `implement` | `skills/engineering/implement/SKILL.md` | `.agents/skills/implement/` |
| `improve-codebase-architecture` | `skills/engineering/improve-codebase-architecture/SKILL.md` | `.agents/skills/improve-codebase-architecture/` |
| `prototype` | `skills/engineering/prototype/SKILL.md` | `.agents/skills/prototype/` |
| `research` | `skills/engineering/research/SKILL.md` | `.agents/skills/research/` |
| `resolving-merge-conflicts` | `skills/engineering/resolving-merge-conflicts/SKILL.md` | `.agents/skills/resolving-merge-conflicts/` |
| `tdd` | `skills/engineering/tdd/SKILL.md` | `.agents/skills/tdd/` |
| `to-spec` | `skills/engineering/to-spec/SKILL.md` | `.agents/skills/to-spec/` |
| `to-tickets` | `skills/engineering/to-tickets/SKILL.md` | `.agents/skills/to-tickets/` |
| `wayfinder` | `skills/engineering/wayfinder/SKILL.md` | `.agents/skills/wayfinder/` |

The upstream snapshot and support assets are retained where the procedure
requires them. The complete attribution and MIT license are in
`.agents/THIRD_PARTY_NOTICES.md`.

## First-party Campaign

`campaign` is an explicit-only first-party orca-kit skill distributed through
the same catalog and generated-artifact pipeline as upstream skills. Its origin
records `orca-kit` authorship plus source and render hashes; it is not a Matt
Pocock adaptation and never appears in third-party notices. Its
`agents/openai.yaml` disables implicit invocation, and its focused references
keep the Campaign Record, preflight, and lifecycle rules out of the entrypoint.

## Orca and Codex changes

The local adaptations preserve the upstream engineering procedures while
making these deliberate changes:

- Orca is the only execution and delegation layer. The coordinator owns the
  conversation, GitHub Issue, Run, Task DAG, gates, worktree placement, and
  integration; workers stay within a bounded Dispatch and report once.
- GitHub `DYEWolf/orca-kit` is the durable Issue tracker. Cross-Issue blockers
  remain GitHub dependencies, while Task dependencies remain inside the one
  Issue-owned execution Run.
- Adapter-specific invocation wording is replaced with Codex `$skill-name`
  references and the installed skill set. There is no legacy command syntax.
- Direct user waits, unbounded delegation, automatic phase transitions,
  implicit commits, and worker-owned integration are translated into explicit
  coordinator decisions, Orca mailbox questions, bounded Tasks, and evidence
  gates.
- Native Codex metadata disables implicit invocation only for `ask-matt`,
  `campaign`,
  `grill-with-docs`, `handoff`, `implement`, `improve-codebase-architecture`,
  `to-spec`, `to-tickets`, and `wayfinder`. No alternate invocation-disable
  key is used.

## Manual update policy

When upstream changes, compare the full upstream skill tree at the pinned path
with its local adaptation. Apply only compatible changes manually; never bulk
overwrite `.agents/skills/`. Preserve the canonical constitution, GitHub Issue
contract, one execution Run per claimed implementation Issue, Orca ownership,
and coordinator integration rules. Recheck all support assets, Codex metadata,
local links, invocation references, and forbidden compatibility layers before
accepting an update.

## Licensing and compatibility boundary

These adaptations retain the upstream MIT attribution to Matt Pocock. This
installation can expose catalog-derived Claude discovery wrappers only in
Claude-required profiles. Product-specific text and legacy setup,
pull-request-description, and design skills remain excluded from the upstream
inventory.
