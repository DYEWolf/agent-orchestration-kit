---
name: improve-codebase-architecture
description: Scan for deepening opportunities, gather bounded evidence through Orca, and present candidates as a temporary visual HTML report.
---

# Improve Codebase Architecture

This skill surfaces architectural friction; it does not apply an architecture change
during the scan. Read `AGENTS.md` and, when present, `docs/agents/orca-execution.md` for
Orca ownership and risk gates. Read `CONTEXT.md` if it exists and the relevant ADRs
before interpreting a module. The vocabulary is defined here so this skill has no
dependency on another skill: **module**, **interface**, **implementation**, **depth**,
**deep**, **shallow**, **seam**, **adapter**, **leverage**, and **locality**.

## Execution modes

- **Coordinator mode:** choose the scan scope, create bounded read-only evidence Tasks
  when useful, inspect their reports, write the HTML artifact to the OS temp directory,
  and gate any later architecture decision.
- **Worker mode:** inspect only the dispatched scope and return evidence. Do not create a
  Run or Task, launch workers, edit product architecture, update an ADR, or turn a
  candidate into implementation. A worker may write only an artifact explicitly owned by
  its Dispatch, and must report its path and verification.

Scanning and candidate decisions remain planning work; accepting a candidate does not
itself authorize implementation. After a candidate decision is accepted, the coordinator
must create and approve a separate durable implementation issue stating its objective,
acceptance criteria, risk, verification, and dependency gates. Only when that
implementation issue is claimed may the coordinator create or bind exactly one
issue-owned execution Run and its bounded Task DAG; do not claim orchestration without
those records.

## 1. Explore with bounded evidence

Scope before scanning. Follow a user-named module, subsystem, or pain point; otherwise
use recent history to identify hot spots, then widen only when evidence requires it.
Read the domain glossary and local ADRs first. Look for:

- a shallow module whose interface nearly matches its implementation;
- understanding that requires bouncing across many modules with poor locality;
- pure functions extracted for tests while the real behavior leaks at their call sites;
- tightly coupled modules leaking across a seam;
- untested behavior that cannot be reached through a useful interface.

Apply the deletion test: would deleting this module concentrate complexity in a better
place, or merely move it? A candidate needs evidence from actual files, call paths, tests,
or history. The coordinator may dispatch separate read-only evidence Tasks for genuinely
independent areas. Each Task must have a bounded file scope, evidence questions, expected
citations, and a report contract; the coordinator integrates reports before proposing a
candidate. A worker never creates those Tasks itself.

## 2. Present candidates as a temporary HTML artifact

Write a fresh self-contained file to the OS temp directory, using `$TMPDIR` then `/tmp`
(or the platform equivalent), for example
`<tmpdir>/architecture-review-<timestamp>.html`. Do not write the report into the repo.
Use the existing `HTML-REPORT.md` scaffold as the local format reference. Open it for the
user when the environment permits and report its absolute path.

The report uses Tailwind and Mermaid CDN assets only for presentation, with hand-built
CSS/SVG where that communicates structure better. Each candidate card contains:

- involved files/modules;
- the observed problem and evidence;
- the proposed deepening in plain English;
- benefits stated as locality, leverage, and test-surface gains;
- a before/after visualization of the seam and module shape;
- a recommendation badge: `Strong`, `Worth exploring`, or `Speculative`;
- an explicit ADR warning when the candidate would reopen a real existing decision.

Use the architectural nouns consistently. A deep module puts substantial implementation
behind a small interface; a shallow module exposes nearly as much interface as
implementation. An adapter is justified by a real seam and improves locality only when
it hides a meaningful variation. Do not propose a final interface in the scan report.
End with one top recommendation and ask which candidate the owner wants to explore.

## 3. Gate any architecture change

The report is not approval. Before changing architecture, the coordinator must:

1. select one named candidate and state the problem it solves;
2. create or update the decision issue with evidence and affected scope;
3. resolve the decision, including ADR/domain implications and migration risk;
4. after the candidate decision is accepted, create and approve a separate durable
   implementation issue with an objective, acceptance criteria, risk, verification,
   and dependency gates; keep the scan and decision in planning;
5. claim the implementation issue, then create or bind exactly one issue-owned execution
   Run and its bounded Task DAG with rollback or compatibility criteria;
6. dispatch bounded implementation work, verify its actual diff, and obtain the
   independent review required by `AGENTS.md` when the change affects architectural
   boundaries, data integrity, security, deployment, or broad cross-cutting behavior.

Workers may escalate a candidate when evidence reveals a public contract, persistent
data, security assumption, or ADR conflict. They must stop at that gate and report the
evidence; they do not decide or implement around it.
