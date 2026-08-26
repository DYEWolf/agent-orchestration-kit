# orca-kit

`@dyewolf/orca-kit` is an open-source npm CLI for configuring an existing GitHub
repository with an opinionated Orca coordinator/worker engineering workflow.

The project is currently under development. Phase 2 supports deterministic
planning and safe local application for the `codex-only` profile:

```bash
npm install
npm run build
node dist/cli.js init /path/to/repository --profile codex-only --dry-run
node dist/cli.js init /path/to/repository --profile codex-only --yes
node dist/cli.js doctor /path/to/repository
node dist/cli.js diff /path/to/repository
```

The CLI does not install or authenticate Orca, Codex, Claude, GitHub CLI, models,
accounts, subscriptions, or credentials. Phase 2 performs local repository
writes only; global Orca and remote GitHub integration arrive in Phase 4.

## Project status

- Phase 0: repository, package identity, and policy documents
- Phase 1: configuration, profiles, repository inspection, desired-state
  rendering, deterministic ChangePlan, in-memory filesystem, and drift detection
- Phase 2: atomic local application and rollback, managed instructions, pinned
  17-skill bundle, provenance, local doctor/diff, and drift refusal
- Later phases: Claude compatibility, Orca/GitHub integration, and release automation

See [the approved specification](docs/approved-specification.md) and
[contributing guide](CONTRIBUTING.md).

## Non-affiliation

This project is not affiliated with, endorsed by, or an official product of
Orca or its maintainers.

## License

Original code is licensed under the MIT License. Bundled third-party material
retains its own attribution and license notices.
