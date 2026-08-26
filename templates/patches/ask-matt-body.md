# Ask Matt

Route work only through the skills installed by orca-kit. Name skills neutrally;
the active harness decides the invocation syntax.

## Main product flow

1. When the destination is clear but details remain unresolved, start with
   grill-with-docs. It uses grilling and domain-modeling to establish shared
   language and decisions.
2. When the effort is too foggy or too large for one session, use wayfinder to
   create and resolve a bounded decision map. When the route becomes buildable,
   return to grill-with-docs if conversational alignment remains.
3. After the understanding gate is approved, use to-spec.
4. After the specification gate is approved, use to-tickets.
5. After the ticket breakdown is approved, use implement once per claimed,
   executable, unblocked GitHub implementation Issue.
6. Implementation uses tdd where appropriate and risk-based code-review before
   the Issue is closed.

Completing one phase never silently invokes the next. Even when the user
authorizes an end-to-end flow, pause at the understanding, specification, and
ticket-breakdown gates.

## Other routes

- A difficult or intermittent defect: diagnosing-bugs, then tdd for the
  regression and improve-codebase-architecture if the missing seam is systemic.
- Codebase health: improve-codebase-architecture to find candidates, then
  codebase-design to shape the selected change.
- A question needing runnable evidence: prototype.
- Primary-source reading: research.
- A merge or rebase already in conflict: resolving-merge-conflicts.
- A portable context transfer: handoff.
- Direct vocabulary work: domain-modeling or codebase-design.
- A focused review: code-review.

## Installed vocabulary

The complete installed set is: ask-matt, grill-with-docs, to-spec, to-tickets,
implement, wayfinder, improve-codebase-architecture, handoff, grilling,
domain-modeling, research, prototype, tdd, diagnosing-bugs, codebase-design,
code-review, and resolving-merge-conflicts.

Do not route to any skill outside this list.
