# Phase 3 — Claude compatibility and Doctor probes

Status: implemented; live Claude wrapper smoke passed on Claude Code 2.1.236 on
2026-08-26.

Claude-required profiles render `CLAUDE.md` and 17 lightweight `.claude/skills`
wrappers. `WorkflowProject.doctor()` determines this from the installed profile,
then reports stable CLI presence, minimum version (`2.1.236`), authentication
(`claude auth status --json`), canonical routing, and wrapper integrity checks.
Codex-only installations skip Claude compatibility and contain no Claude
artifacts; pending profiles retain `WARN` routing status.

The process adapter executes only `claude --version` and read-only
`claude auth status --json`, with argv arrays and sanitized failure messages.
Deterministic tests use fake executables and never require credentials or
network access. The opt-in `npm run smoke:claude` creates a fresh
`claude-coordinator` fixture, places a sentinel only in a canonical `.agents`
skill body, invokes three fresh `Read`-only, `dontAsk`, non-persistent Claude
sessions, verifies the exact sentinel, and records the tested Claude version.
It is excluded from all default test, check, prepack, and packed-smoke paths.

## Deterministic implementation evidence

- Adapter slice: red on the missing `NodeHarnessAdapter` module, then green on
  the fake-executable matrix covering presence, outdated/malformed versions,
  authentication, and command failures.
- Doctor slice: red on the unwired Claude seam, then green after injecting the
  fake adapter; the profile matrix covers all four profiles and stable/pending
  routing outcomes.
- CLI/packaging slice: green through a fake executable with `npm run check`;
  this includes typecheck, bundle validation, 78 tests, build, and packed smoke
  for all four profiles. `git diff --check` is clean.
- Coordinator gate: `npm run smoke:claude` passed on Claude Code 2.1.236. Three
  fresh non-persistent sessions returned the exact sentinel found only in the
  canonical `.agents` body.
