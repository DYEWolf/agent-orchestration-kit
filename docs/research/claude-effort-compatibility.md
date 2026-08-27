# Claude effort compatibility

Date: 2026-08-27

## Question

Which effort values can V1 safely encode for Claude routes that use the moving
`opus` and `sonnet` aliases?

## Evidence

- Claude Code 2.1.236 is installed in the validated environment and exposes
  `--effort` for the current session.
- Anthropic documents `low`, `medium`, `high`, `xhigh`, and `max` as CLI values,
  with availability dependent on the resolved model.
- Opus 4.7 supports all five values. Opus 4.6 and Sonnet 4.6 support `low`,
  `medium`, `high`, and `max`, but not `xhigh`.
- Unsupported requested levels can fall back, and Anthropic's model defaults
  differ by model generation.
- The V1 profiles intentionally resolve Claude through the moving `opus` and
  `sonnet` aliases rather than exact model identifiers.

Primary references:

- <https://code.claude.com/docs/en/model-config>
- <https://code.claude.com/docs/en/cli-usage>
- <https://code.claude.com/docs/en/configuration>

## Accepted contract

- V1 keeps `effort` optional and unset in the built-in Claude routes.
- Claude Code applies the default of the model resolved from the alias.
- Doctor validates the installed Claude CLI and resolved capability rather than
  treating one effort value as universally valid across moving aliases.
- Exact Codex routes retain their explicit effort values.

## Ticket implications

Phase 5 verification covers alias resolution and CLI compatibility without
asserting a provider default that can change independently of this package.
