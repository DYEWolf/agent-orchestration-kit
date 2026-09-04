# Design It Twice

When the user wants to explore alternative interfaces for a chosen deepening candidate, use this sibling-Task pattern. Based on "Design It Twice" (Ousterhout): your first idea is unlikely to be the best. The coordinator owns the user conversation, Task creation, comparison, and decision; workers only return bounded design evidence.

Uses the vocabulary in [SKILL.md](SKILL.md): **module**, **interface**, **seam**, **adapter**, **leverage**.

## Process

### 1. Frame the problem space

Before creating sibling Orca Tasks, the coordinator writes a user-facing explanation of the problem space for the chosen candidate:

- The constraints any new interface would need to satisfy
- The dependencies it would rely on, and which category they fall into (see [DEEPENING.md](DEEPENING.md))
- A rough illustrative code sketch to ground the constraints, not a proposal, just a way to make the constraints concrete

The coordinator confirms the framing and constraints with the user, then creates the Tasks. A worker receives the framing in its contract and does not present directly to the user.

### 2. Create sibling Orca Tasks

Create three or more sibling Orca Tasks in the same Run, each with the same candidate, context, owned scope, acceptance criteria, and verification, but a **radically different** interface constraint. The coordinator may schedule independent Tasks according to Orca policy; this procedure never creates nested Runs or Tasks.

Give each Task a separate technical brief (file paths, coupling details, dependency category from [DEEPENING.md](DEEPENING.md), and what sits behind the seam). Include the user-approved problem framing in the contract, then give each Task a different design constraint:

- Task A: "Minimize the interface: aim for 1–3 entry points max. Maximise leverage per entry point."
- Task B: "Maximise flexibility: support many use cases and extension."
- Task C: "Optimise for the most common caller: make the default case trivial."
- Task D (if applicable): "Design around ports & adapters for cross-seam dependencies."

Include both [SKILL.md](SKILL.md) vocabulary and `CONTEXT.md` vocabulary in every Task contract so reports name things consistently with the architecture language and the project's domain language. If a contract omits an owned scope or acceptance criterion, the coordinator fixes the contract before dispatch.

Each worker reports:

1. Interface (types, methods, params, plus invariants, ordering, error modes)
2. Usage example showing how callers use it
3. What the implementation hides behind the seam
4. Dependency strategy and adapters (see [DEEPENING.md](DEEPENING.md))
5. Trade-offs: where leverage is high, where it's thin

### 3. Present and compare

The coordinator presents designs sequentially so the user can absorb each one, then compares the reports in prose. Contrast by **depth** (leverage at the interface), **locality** (where change concentrates), and **seam placement**.

After comparing, give your own recommendation: which design you think is strongest and why. If elements from different designs would combine well, propose a hybrid. Be opinionated: the user wants a strong read, not a menu.
