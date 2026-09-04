---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design, while recording the resulting domain decisions in project docs.
---

# Grill with Docs

The coordinator is the conversational owner for this entire flow. Use `$grilling` to ask one decision question at a time and `$domain-modeling` when a term, relationship, or hard-to-reverse trade-off belongs in `CONTEXT.md` or an ADR.

When a fact can be discovered from the repository or another available source, look it up instead of asking the user. If that investigation is bounded and needs a worker, the coordinator creates one Orca Task and gives it a read-oriented evidence contract. The worker returns findings; it does not interview the user, make the product decision, publish documents, or create another Task. Follow `docs/agents/orca-execution.md` for the Task contract and evidence lifecycle.

## Process

1. Read the relevant project context and ADRs, then state the decision or design question in the user's vocabulary.
2. Gather facts directly or through coordinator-created Orca Tasks. Keep evidence separate from decisions and bring the report back to the coordinator.
3. Interview the user one question at a time. Give a recommended answer, wait for the user's decision, and probe edge cases until the understanding is shared.
4. Record resolved domain terms in `CONTEXT.md` and offer an ADR only for a hard-to-reverse, surprising trade-off with real alternatives. Do this as the coordinator after the decision is settled.
5. End by presenting the shared understanding and unresolved questions. Do not invoke specification, ticket, or implementation work automatically. A later phase starts only when the user explicitly requests it or an explicitly authorized end-to-end flow names that transition.

This skill sharpens and documents a decision; it does not publish executable implementation work.
