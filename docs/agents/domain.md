# Domain documentation

This file defines how skills consume domain documentation. It intentionally
declares no product vocabulary: the repository owns its terms, boundaries,
invariants, and decisions.

## Before exploring

Read `CONTEXT.md` at the repository root. If `CONTEXT-MAP.md` exists, follow it
to the context-specific `CONTEXT.md` files relevant to the work. Read ADRs under
`docs/adr/` and any context-scoped ADR directories that touch the area.

If these files do not exist, proceed silently. Do not flag their absence, invent
domain language, or suggest creating them before a real term or decision needs
to be recorded. `$domain-modeling` creates them lazily when vocabulary or a
hard-to-reverse decision is genuinely settled.

## Use the repository glossary

Use concepts exactly as the repository glossary defines them in issue titles,
specifications, refactor proposals, test names, and code comments. Do not
replace an established term with a synonym for stylistic variety.

If a needed concept is absent, treat that as an unresolved domain question. Ask
the coordinator to route `$domain-modeling` or `$grill-with-docs`; do not fill
the gap with an invented term.

## Respect ADRs

If a proposed change conflicts with an existing ADR, surface the conflict with
the ADR identifier and evidence before acting. Do not silently override a
decision. The coordinator decides whether to reopen or supersede it and records
that decision in the repository's domain docs.
