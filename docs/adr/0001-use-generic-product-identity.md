# Use a generic product identity

Status: accepted

This independent project configures workflows that use Orca, but it is not an
official Orca product. We chose `agent-orchestration-kit` for the repository,
npm package, CLI, and owned internal identifiers instead of `orca-kit`, because
the more descriptive name avoids making a third-party product name the dominant
part of our identity or requiring permission as a release condition. “Orca” is
reserved for truthful references to the external runtime and compatibility
contract. Since no version has been published, the old identity has no V1
compatibility guarantee; the implementation must complete the rename before
`1.0.0` while retaining clear non-affiliation and attribution notices.
