---
name: prototype
description: Build an authorized throwaway prototype to answer a design question, with an explicit issue-owned artifact and capture route.
---

# Prototype

A prototype is **throwaway code that answers a question**. The question decides the shape, and the issue or Orca Task decides the allowed scope, artifact path, and verification. Read `AGENTS.md` and, when present, `docs/agents/orca-execution.md` before starting.

The coordinator owns the design conversation and authorization. A worker may build only within a coordinator-created Task, does not ask the user, create a Run or Task, choose a product decision, or commit/merge a branch. The coordinator/integrator presents the artifact, records the user's verdict, and owns any branch, commit, integration, or issue update.

## Pick a branch

Identify which question is being answered from the user-approved issue, conversation, or Task contract:

- **"Does this logic / state model feel right?"** → [LOGIC.md](LOGIC.md). Build a single shareable HTML file (free-play buttons plus tabbed guided walkthroughs) that pushes the state machine through cases that are hard to reason about on paper, and that a non-developer can drive.
- **"What should this look like?"** → [UI.md](UI.md). Generate several radically different UI variations on a single route, switchable via a URL search param and a floating bottom bar.

The two branches produce very different artifacts, so getting this wrong wastes the whole prototype. If the approved question is ambiguous, stop and ask the coordinator to resolve it; do not guess inside a worker Task. The coordinator may choose the branch directly or update the Task contract before dispatch.

## Rules that apply to both

1. **Throwaway from day one, and clearly marked as such.** Locate the prototype code close to where it will actually be used (next to the module or page it's prototyping for) so context is obvious, but name it so a casual reader can see it's a prototype, not production. For throwaway UI routes, obey whatever routing convention the project already uses; don't invent a new top-level structure. Stay within the issue/Task owned scope.
2. **Trivial to run.** A UI prototype starts from one command in the project's task runner: `pnpm <name>`, `python <path>`, `bun <path>`, etc. A logic demo is a single HTML file the user double-clicks. Either way, no thinking required to start it.
3. **No persistence by default.** State lives in memory. Persistence is the thing the prototype is _checking_, not something it should depend on. If the question explicitly involves a database, hit a scratch DB or a local file with a clear "PROTOTYPE, wipe me" name.
4. **Skip the polish.** No tests, no error handling beyond what makes the prototype _runnable_, no abstractions. The point is to learn something fast.
5. **Surface the state.** After every action (logic) or on every variant switch (UI), print or render the full relevant state so the coordinator can show what changed.
6. **Capture it when done.** After the coordinator records the verdict, fold any validated decision into the authorized implementation issue. If the artifact is worth retaining, the coordinator/integrator explicitly chooses its issue-owned branch or other durable location, records a pointer from the implementation issue, and owns the commit and integration; otherwise the artifact remains uncommitted and is reported for cleanup. The main branch keeps only the validated production decision, not an unreviewed prototype shell.
