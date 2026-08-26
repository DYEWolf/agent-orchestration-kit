---
name: research
description: Investigate a question against high-trust primary sources and capture authorized findings as a Markdown file in the repo, directly or through a bounded Orca evidence Task.
---

# Research

Research is coordinator-owned evidence gathering. The coordinator may do the work directly or create one bounded, read-only Orca Task with a question, source standard, owned scope, output contract, and verification. A worker reports evidence to the coordinator; it does not ask the user, create a Task, choose a product decision, publish an issue, or write files unless the Task contract explicitly authorizes the output path. Read `AGENTS.md` and, when present, `docs/agents/orca-execution.md` before routing work.

## Method

1. State the research question, decision it informs, source-quality requirement, and allowed output route in the coordinator's context or Task contract. If any of those are missing in a worker Task, escalate before researching or writing.
2. Investigate against **primary sources** (official docs, source code, specifications, or first-party APIs), not a secondary write-up. Follow every claim back to the source that owns it and record enough citation detail to verify it.
3. Return a concise evidence report to the coordinator. Write a single Markdown artifact only when the coordinator or Task contract authorizes that path; use the repository's existing notes convention and do not create unrelated files.
4. Keep findings separate from decisions. The coordinator presents evidence to the user, records accepted decisions, and decides whether the result belongs in an issue, ADR, or another durable artifact.

Research does not dispatch work, run parallel workers, or advance a planning or implementation flow automatically.
