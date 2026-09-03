# Security policy

## Supported versions

V1 supports the latest commit on `main` when run with Node.js 22, 24, or 26 on
macOS, Windows, or Linux. The package requires Node.js 22 or newer; the tested
Orca compatibility baseline is 1.4.190.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do not
open a public Issue for an unpatched vulnerability or include credentials,
tokens, private repository data, or other secrets in a report.

Include the affected version, reproduction steps, impact, and any suggested
mitigation. Maintainers will acknowledge a complete report as soon as practical.

The CLI never installs tools, logs in, manages credentials, or reads secret
environment values. Do not include credentials in a report.
