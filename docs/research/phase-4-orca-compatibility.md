# Phase 4 Orca compatibility baseline

Date: 2026-08-27

## Question

What minimum Orca contract can V1 diagnose consistently across macOS, Windows,
and Linux without depending on platform-specific installation paths?

## Evidence

- The latest stable upstream release was
  [`v1.4.190`](https://github.com/stablyai/orca/releases/tag/v1.4.190) on
  2026-08-27.
- The installed signed application and `orca status --json` both reported
  `1.4.190`.
- `orca agent-context --json` is a local read of the CLI command registry and
  does not require a running Orca app.
- The required read surfaces are available as machine-readable commands:
  `status --json`, `skills installed --json`, and `repo list --json`.
- The offered mutation surfaces are explicit commands: `skills install`, which
  supports a read-only dry run, and `repo add --path`.

## Accepted compatibility contract

- The V1 minimum tested Orca version is `1.4.190`.
- Discovery resolves the `orca` executable from `PATH`; it does not probe
  platform-specific application or installation directories.
- Doctor checks required commands through `agent-context --json`, runtime and
  graph readiness plus `appVersion` through `status --json`, the global
  orchestration skill through `skills installed --json`, and repository
  registration through `repo list --json`.
- A version at or above the minimum still fails compatibility when a required
  command or capability is absent. The diagnostic names the missing boundary.
- Installation and registration remain separately enumerated, confirmed
  mutations; detection never performs either action.

## Verification implications

Deterministic tests use fake `orca` executables for missing, malformed,
outdated, capability-incomplete, unready, skill-missing, and repo-unregistered
states. Cross-platform coverage tests command and JSON contracts rather than
filesystem locations. A live smoke on `1.4.190` proves the accepted baseline.

