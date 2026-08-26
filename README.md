# orca-kit

`@dyewolf/orca-kit` is an open-source npm CLI for configuring an existing GitHub
repository with an opinionated Orca coordinator/worker engineering workflow.

The project is currently under development. Phase 1 supports deterministic,
read-only planning for the `codex-only` profile:

```bash
npm install
npm run build
node dist/cli.js init /path/to/repository --profile codex-only --dry-run
```

The CLI does not install or authenticate Orca, Codex, Claude, GitHub CLI, models,
accounts, subscriptions, or credentials. Phase 1 never writes to the target
repository; safe local application arrives in Phase 2.

## Project status

- Phase 0: repository, package identity, and policy documents
- Phase 1: configuration, profiles, repository inspection, desired-state
  rendering, deterministic ChangePlan, in-memory filesystem, and drift detection
- Later phases: local application, full skill bundle, Claude compatibility,
  Orca/GitHub mutations, and release automation

See [the approved specification](docs/approved-specification.md) and
[contributing guide](CONTRIBUTING.md).

## Non-affiliation

This project is not affiliated with, endorsed by, or an official product of
Orca or its maintainers.

## License

Original code is licensed under the MIT License. Bundled third-party material
retains its own attribution and license notices.
