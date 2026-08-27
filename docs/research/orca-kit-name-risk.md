# `orca-kit` name and affiliation-risk research

Date: 2026-08-27

## Question

Can `@dyewolf/orca-kit` be published as an independent CLI for configuring Orca
workflows without creating an obvious trademark or source-confusion risk?

This is a preliminary product-risk review, not legal advice or a comprehensive
trademark clearance opinion.

## Evidence

### Package identity and availability

- The authenticated npm user is `daedhriel`, and npm reports that user as an
  `owner` of the `dyewolf` organization.
- `@dyewolf/orca-kit` returned `E404` from the public npm registry on 2026-08-27,
  so the package name remains unpublished and available to this scope.
- The product owner additionally confirmed that the organization accepts package
  management, account 2FA is `auth-and-writes`, and GitHub is linked.

This resolves npm scope permission. It does not establish trademark permission.

### Upstream Orca identity

- The upstream product markets itself as **Orca**, an AI coding orchestrator for
  agents and worktrees. Its public repository is
  [`stablyai/orca`](https://github.com/stablyai/orca), and its official site is
  [`onorca.dev`](https://www.onorca.dev/).
- The locally installed signed application identifies itself as `Orca`, bundle
  identifier `com.stablyai.orca`, copyright `stablyai`, and version `1.4.190`.
  Its code signature names Lovecast LLC; the upstream MIT license names Lovecast
  Inc. as copyright holder.
- `orca-kit` targets the same users and directly configures workflows around this
  Orca product. The shared word is therefore not incidental or used for unrelated
  goods.

### Existing ecosystem use

- npm already contains third-party integration names such as
  [`orca-mcp`](https://www.npmjs.com/package/orca-mcp) and
  [`@cotal-ai/orca`](https://www.npmjs.com/package/@cotal-ai/orca). Their existence
  shows that descriptive ecosystem naming occurs; it does not prove permission or
  create a safe harbor for a new package.
- No published `@dyewolf/orca-kit` package was found, and GitHub's exact
  `orca-kit` repository-name search primarily returned this project. A separate
  `orca-workflow-kit` repository also targets Stably's Orca, so that alternative
  is not uniquely clear either.

### Applicable search standard and search limitation

The [USPTO likelihood-of-confusion guidance](https://www.uspto.gov/trademarks/search/likelihood-confusion)
states that similarity of marks and relatedness of goods or services are both
material. Its [federal search guidance](https://www.uspto.gov/trademarks/search/federal-trademark-searching)
also says that a comprehensive clearance search requires more than a narrow
federal query and may warrant a private trademark attorney.

The official interactive USPTO trademark search was not available through this
session's browser, and the official API requires authenticated access. Live US,
EU, Mexican, state, and common-law results were therefore not exhaustively
reviewed. No claim of “no conflicting mark” is supported by this research.

## Inference and risk assessment

The preliminary risk is **material, not cleared**:

- `Orca` is the dominant element of `orca-kit`.
- The package is designed specifically for the upstream Orca product and travels
  through the same developer-tool channels.
- The `@dyewolf` scope, open-source status, and existing non-affiliation notice
  reduce source confusion but do not guarantee that users will not perceive an
  official plugin, SDK, or endorsed toolkit.
- The upstream MIT license permits use of its source code subject to the license;
  it does not itself grant trademark or endorsement rights.

## Product-owner decision

The product owner rejected a release process that depends on permission or a
no-objection from the Orca owner. The approved replacement identity is
`agent-orchestration-kit`: repository `DYEWolf/agent-orchestration-kit`, package
`@dyewolf/agent-orchestration-kit`, and bin `agent-orchestration-kit`.

The rename is complete in scope: public identity, owned internal directories,
managed markers, generated headers, documentation, constants, and metadata all
move to the new name. “Orca” remains only where it truthfully identifies the
external runtime or compatibility contract.

The new package may truthfully describe Orca compatibility, but release materials
must still:

- identify Orca as an external user-supplied runtime;
- link to the upstream Orca product and identify the independent `@dyewolf`
  publisher;
- retain a conspicuous non-affiliation statement in the README, package metadata,
  tarball notices, and generated attribution;
- avoid upstream logos, trade dress, or claims of endorsement; and
- distinguish upstream Orca assets from original project assets.

## Unresolved evidence

- Live trademark database results in the intended launch jurisdictions.
- Any private or public trademark policy from Stably/Lovecast.
- Implementation and verification of the approved complete identity migration.
