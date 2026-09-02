# Phase 5 — public release matrix

Status: implemented for the repository-owned release contract.

## V1 runtime policy

V1 validates the package on Node 22, 24, and 26 across `ubuntu-latest`,
`macos-latest`, and `windows-latest`. These are explicit OS/Node pairs rather
than an independently generated matrix, so the nine supported environments
are visible in review and validated as a contract. When a tested major reaches
end of life, a later release may retire that line and add the next maintained
line; `engines.node` remains `>=22` unless a separately approved product
decision changes the V1 runtime floor.

The workflow runs for pull requests, pushes to `main`, and explicit manual
`workflow_dispatch` requests. It grants only top-level `contents: read`, uses
concurrency cancellation for superseded runs, and has one fail-fast-disabled
matrix job with stable `Node <major> on <runner>` diagnostic names.

## Integrity and diagnostics

Each job checks out without persisted credentials. The repository
`.gitattributes` rule (`* text=auto eol=lf`) provides LF working-tree bytes for
hash-sensitive tracked text on Windows, while intentional Windows command
fixtures retain CRLF through the `.bat` and `.cmd` exceptions. Jobs install
with clean `npm ci`, do not configure an npm dependency cache, and run
`npm run check`. The release matrix itself performs no publishing, deployment,
account access, secret use, or live tool invocation. Failures retain the
install/check output as an artifact whose name includes the runner, Node major,
run ID, and attempt; artifact names therefore remain unique and valid on all
three platforms.

`npm run release:validate` parses the workflow and proves the exact triggers,
permissions, concurrency settings, nine explicit pairs, fail-fast policy,
ordered steps, action settings, cache-free setup, credential-free checkout,
and failure-upload behavior. Its focused test also runs a deliberately invalid
in-memory fixture and checks the actionable missing/unexpected pair diagnostic.

## Packed smoke fixture

`npm run smoke:packed` inspects actual tar archive entries before installing the
packed package. It invokes the installed `.bin` executable from fresh Git
repositories whose paths contain spaces and Unicode, and exercises dry-run,
first init, second no-op, Doctor, and diff for all four profiles. Fake Claude,
Orca, and GitHub tools are disposable local launchers with POSIX and Windows
variants; they never use real accounts or the network, and the fake GitHub
label is created exactly once per fixture.

The fixture pre-seeds a CRLF `AGENTS.md`. The smoke asserts that dry-run does
not alter it, that the first init preserves the user-owned CRLF bytes while
using canonical LF for the generated managed block, and that the second init
is byte-for-byte a no-op. This tests line-ending portability without changing
product semantics.

Required branch protection or ruleset enforcement is repository configuration.
Phase 5 documents and validates the contract but does not change branches,
settings, rulesets, or protection in this repository-owned workflow task.
