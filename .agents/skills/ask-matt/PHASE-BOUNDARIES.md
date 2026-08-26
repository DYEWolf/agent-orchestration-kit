# Phase boundaries

A phase is a coherent chunk of work inside a Sol-owned conversation: grilling, specification, ticket drafting, implementation, or review. A phase boundary is the gap between two such chunks. Make the transition decision at the boundary; do not let completion of one skill silently invoke another.

The boundary never transfers conversational ownership. Sol remains responsible for user questions, decisions, approvals, and phase transitions. Orca workers supply bounded evidence to the coordinator; they are not alternate conversation owners. For the lifecycle and evidence contract, read `docs/agents/orca-execution.md`.

## The options

| Option | Meaning |
| --- | --- |
| **Continue** | Stay in the current Sol conversation when the next work needs the current decisions or evidence as a primary source. |
| **Explicit transition** | Invoke the named next skill only after its entry criteria are met and the user requests it or an explicitly authorized end-to-end flow includes it. |
| **Orca evidence Task** | Ask the coordinator to create one bounded, read-oriented Task when a fact or probe is needed. The worker returns a report to Sol; this is not a conversation handoff or a nested dispatch. |
| **`$handoff`** | Write a portable summary only when work is moving to another harness, directory, or colleague. It is a transport boundary, not an automatic workflow step. |
| **Clear or compact** | Use session-management controls only after durable decisions, evidence, or issue links are recorded. They do not determine issue sizing or worker routing. |

## Decision tree

Work top to bottom at the boundary; the first applicable answer wins.

1. **Does the next activity need the current conversation as its primary source?** Continue under Sol ownership.
2. **Is a bounded fact or probe missing?** Have the coordinator create an Orca evidence Task, then return to the same phase with its report. Workers do not ask the user or decide whether to advance.
3. **Is the work moving to another harness, directory, or colleague?** Use `$handoff` and resume only from its durable artifact.
4. **Has the user explicitly authorized the next phase, or named an end-to-end flow that includes it?** Invoke that phase. Otherwise stop and present the result, waiting for direction.
5. **Is the current conversation no longer needed?** Clear or compact only after recording the durable handoff. Keep GitHub specs and implementation issues independent of session state.

## Phase-specific gates

- Grilling ends in shared understanding and recorded domain decisions; it does not invoke specification automatically.
- Specification ends only after explicit approval of the full draft, then publishes a non-executable umbrella/spec issue; it does not create tickets automatically.
- Ticket drafting ends only after explicit approval of the complete breakdown, then publishes durable issues; it does not dispatch implementation automatically.
- Implementation and review advance only through the coordinator's explicitly authorized Orca flow and evidence-based acceptance.

The sole exception to these stopping rules is a user-authorized end-to-end flow whose requested behavior explicitly includes the listed transitions. Even then, each phase must satisfy its own approval and evidence gates.
