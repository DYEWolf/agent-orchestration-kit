# Contributing

Thank you for helping improve `agent-orchestration-kit`, the independent CLI
compatible with the external Orca runtime. It is not affiliated with, endorsed
by, or an official product of Orca or its maintainers.

1. Open an Issue before substantial work so scope and acceptance criteria are clear.
2. Use Node.js 22 or newer; V1 is validated on Node 22, 24, and 26 across
   macOS, Windows, and Linux. Install dependencies with `npm ci`.
3. Run `npm run check` before submitting a pull request.
4. Keep external mutations explicit and preserve the ChangePlan-before-write,
   dry-run, idempotency, drift-refusal, and local-rollback invariants.
5. Do not add fetched-at-install-time templates, credentials, or unreviewed
   upstream skill content.
6. Preserve third-party provenance and the approved historical-identity
   allowlist; run `npm run identity:validate` after identity or URL changes.

Contributions are accepted under the repository's MIT License. Third-party
content must include complete provenance and compatible licensing.
