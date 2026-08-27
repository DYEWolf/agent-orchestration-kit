# npm trusted-publishing bootstrap

Date: 2026-08-27

## Question

How can the first stable release use npm Trusted Publishing when the package
does not yet exist?

## Evidence

- npm Trusted Publishing requires npm CLI 11.5.1 or newer, Node.js 22.14.0 or
  newer, a supported hosted CI runner, and `id-token: write` for GitHub Actions.
- npm requires a package to exist before a trusted publisher relationship can
  be configured.
- npm staged publishing also requires the package to exist, so it cannot create
  the initial package as a workaround.
- Trusted Publishing from a public GitHub repository automatically attaches
  provenance to a public package.

Primary references:

- <https://docs.npmjs.com/trusted-publishers/>
- <https://docs.npmjs.com/staged-publishing/>

## Accepted release contract

No publication occurs while planning or creating tickets. After all release
gates pass:

1. Publish version 0.1.0 manually with the owner's 2FA-protected npm session and
   the `next` dist-tag. It must be the same inspected release-candidate content;
   it does not become `latest`.
2. Configure `@dyewolf/agent-orchestration-kit` to trust only the repository's
   `publish.yml` GitHub Actions workflow and protected `npm-publish` environment.
3. Verify the OIDC relationship and disallow traditional publish tokens.
4. Publish 1.0.0 from the protected workflow. This is the first stable and
   receives automatic npm provenance.

The release Issue must keep both registry mutations explicit and human-approved.
