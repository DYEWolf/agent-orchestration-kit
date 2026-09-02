# agent-orchestration-kit

`@dyewolf/agent-orchestration-kit` is an open-source npm CLI for configuring an
existing GitHub repository with an opinionated agent-orchestration workflow
compatible with the external Orca runtime.

The project is currently under development. Phase 3 supports deterministic
planning and safe local application for all four approved routing profiles:

```bash
npm install
npm run build
node dist/cli.js init /path/to/repository --profile codex-only --dry-run
node dist/cli.js init /path/to/repository --profile codex-only --yes
node dist/cli.js init /path/to/repository --profile claude-coordinator --yes
node dist/cli.js init /path/to/repository --profile claude-only --yes
node dist/cli.js init /path/to/repository --profile codex-coordinator --yes
node dist/cli.js doctor /path/to/repository
node dist/cli.js diff /path/to/repository
```

For an explicitly credentialed Claude wrapper check, run `npm run smoke:claude`.
It creates a disposable Claude-profile fixture, runs three fresh read-only
non-persistent sessions, and removes the fixture afterward. This opt-in smoke
is intentionally excluded from `npm test`, `npm run check`, `prepack`, and the
packed smoke.

The CLI does not install or authenticate Orca, Codex, Claude, GitHub CLI, models,
accounts, subscriptions, or credentials. Phases 2 and 3 perform local repository
writes only; global Orca and remote GitHub integration arrive in Phase 4.

## Project status

- Phase 0: repository, package identity, and policy documents
- Phase 1: configuration, profiles, repository inspection, desired-state
  rendering, deterministic ChangePlan, in-memory filesystem, and drift detection
- Phase 2: atomic local application and rollback, managed instructions, a
  catalog-derived mixed-origin skill bundle (including first-party Campaign),
  provenance, local doctor/diff, and drift refusal
- Phase 3: all four profiles, Claude Code compatibility wrappers, and
  profile-aware local Doctor checks, including deterministic CLI/auth probes
- Later phases: Orca/GitHub integration and release automation

See [the approved specification](docs/approved-specification.md) and
[contributing guide](CONTRIBUTING.md).

## Practical agent workflow

The installed workflow uses Orca for supervised execution. Claude profiles add
`CLAUDE.md` and lightweight `.claude/skills/` discovery wrappers; canonical skill
bodies remain under `.agents/skills/`. Invoke skills with `$skill-name` syntax;
the coordinator owns the conversation,
GitHub Issues, Runs, Tasks, gates, worktrees, and integration.

For a clear destination, use `$ask-matt` or start with `$grill-with-docs`, then
pause for the understanding gate. After explicit approval, `$to-spec` produces
one non-executable specification Issue; after the full specification is
approved, `$to-tickets` produces executable implementation Issues. Each claimed,
approved, unblocked implementation Issue maps to exactly one Orca execution Run,
which owns its bounded Tasks and Dispatches; `$implement` starts work only after
that transition.

The durable sequence is `Issue → Run → Tasks → Dispatches → verification →
review → acceptance`. A worker sends one `worker_done` report; the coordinator
decides whether the evidence satisfies the Issue and closes it.

Manual Issue execution remains the default. `$campaign` is an explicit-only
authorization for a user-provided fixed Issue set: it performs read-only
preflight, records the immutable authorization, and never acts as a permanent
execution mode or backlog runner.

For foggy or multi-session work, use `$wayfinder` to create a GitHub decision
map and resolve its frontier one decision at a time. Return to grilling or
specification explicitly when the route is clear. Use `$diagnosing-bugs`,
`$research`, `$prototype`, `$domain-modeling`, `$codebase-design`, `$tdd`,
`$improve-codebase-architecture`, `$resolving-merge-conflicts`, `$handoff`, and
`$code-review` for focused on-ramps; none silently advances another phase.

The coordinator routes by uncertainty and blast radius: Luna explores or
implements clear work, Terra handles local judgment, and Sol handles
architecture or independent high-risk review. Workers receive bounded Task
contracts, do not create nested work, and escalate requirement, API, data,
security, or architecture decisions through Orca. Parallel Tasks require
non-overlapping ownership; use the current worktree for shared state and an
Orca child or top-level worktree when isolation is needed.

Verification is deterministic and evidence-based. Review verdicts are `SHIP`,
`FIX_FIRST`, or `RETHINK`; integration waits for the required checks and review,
and the Issue closes only after the final acceptance gate.

## Non-affiliation

This project is not affiliated with, endorsed by, or an official product of
Orca or its maintainers.

## License

Original code is licensed under the MIT License. Bundled third-party material
retains its own attribution and license notices.
