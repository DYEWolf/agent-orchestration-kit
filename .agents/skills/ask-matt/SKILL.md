---
name: ask-matt
description: Route an explicitly invoked request to the installed planning, implementation, diagnosis, review, or handoff flow while Sol retains conversation ownership.
---

# Ask Matt

This is a router and decision aid, not an autonomous dispatcher. Sol asks the user questions, records decisions, and authorizes phase transitions. A worker receives only a coordinator-created, bounded Orca Task and returns evidence; it never owns the conversation, asks the user, makes an unassigned product decision, creates another Task, or silently advances the flow. See `docs/agents/orca-execution.md` and [PHASE-BOUNDARIES.md](PHASE-BOUNDARIES.md).

## Target workflow: idea to ship

Use this path when the user has an idea they want built:

1. **Sharpen and document** — `$grill-with-docs`. Sol interviews one decision at a time, using `$grilling` and `$domain-modeling`. Facts may be gathered through coordinator-created Orca evidence Tasks. The phase ends with shared understanding and recorded decisions.
2. **Specify** — explicitly invoke `$to-spec`. Sol drafts the complete specification, obtains explicit approval of the full document, and publishes one non-executable umbrella/spec issue. The issue is not ready for implementation.
3. **Split durable work** — explicitly invoke `$to-tickets`. Sol drafts outcome-based implementation issues, including acceptance, constraints, risks, verification, and genuine blocking edges; the user explicitly approves the breakdown before publication. Only implementation issues ready to execute receive `ready-for-agent`.
4. **Implement** — explicitly invoke `$implement` for an approved implementation issue. The coordinator owns runtime dispatch through Orca; the issue remains the durable contract and contains no model or routing instructions.
5. **Review and verify** — use `$code-review` when the implementation is ready for review or the user requests it. Accept, correct, or escalate based on the actual diff and deterministic verification.

Campaign is not part of this default path. After tickets are published, manual
Issue execution remains the default; only an explicit `$campaign` invocation
can authorize a fixed multi-Issue execution.

The sequence above is a recommendation. It becomes automatic only when the user explicitly authorizes that end-to-end flow. Completing one phase never implicitly invokes the next phase.

## On-ramps and standalone flows

- **Something is broken or regressed** → `$diagnosing-bugs`. Establish a tight failing feedback loop, then repair it with a regression test.
- **Test-first implementation** → `$tdd`. Use issue/Task-approved seams and keep the red-green loop inside the active implementation contract.
- **A module boundary or public seam is unclear** → `$codebase-design`. Use its vocabulary directly; if alternatives need independent analysis, Sol creates sibling Orca Tasks and synthesizes the decision.
- **A bounded factual question needs primary-source evidence** → `$research`. Run it directly or as a read-only Orca evidence Task; the report returns to Sol.
- **A risky interaction or design assumption needs a disposable artifact** → `$prototype`. Gate the question first, let the coordinator present the artifact, and capture only the approved result.
- **The destination is too foggy to plan** → `$wayfinder`. Resolve decision work until a buildable direction exists, then explicitly return to `$to-spec`.
- **Codebase health** → `$improve-codebase-architecture`. Use it to surface deepening opportunities; take a selected opportunity into `$grill-with-docs` explicitly.
- **Domain language or a hard-to-reverse domain decision** → `$domain-modeling`.
- **An in-progress merge or rebase conflict** → `$resolving-merge-conflicts`.
- **A branch or pull request needs independent inspection** → `$code-review`.
- **The work must move to another harness, directory, or colleague** → `$handoff`, and only at the corresponding phase boundary.
- **Explicitly start, inspect, pause, resume, or cancel a fixed set of approved implementation Issues** → `$campaign`.

If no installed flow fits, keep Sol in the conversation and use a coordinator-created Orca evidence Task only for a bounded fact-finding need. Do not invent a route or present runtime worker selection as a user-facing workflow.

## Routing rules

- Facts are investigated; decisions are put to the user.
- Shared understanding precedes specification; explicit full-spec approval precedes publication.
- An approved umbrella/spec precedes ticket drafting; explicit ticket-breakdown approval precedes publication.
- GitHub issues are durable boundaries for specs and implementation outcomes. Runtime worker routing is an Orca concern and never belongs in a ticket.
- A phase boundary is a decision point, not a trigger. Read [PHASE-BOUNDARIES.md](PHASE-BOUNDARIES.md) before choosing whether to continue, gather bounded evidence, hand off, or enter the next explicitly authorized phase.
