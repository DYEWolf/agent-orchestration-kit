# Execution policy

This document is the canonical routing, context, verification, and review policy
for repository-local Orca execution. `AGENTS.md` owns invariants; skills apply
this policy without inventing a second classifier.

The governing rule is:

> Use the smallest workflow that safely solves the task.

## Classify before orchestrating

Classify four independent axes. Size alone never determines the route.

| Axis | Values | Question |
| --- | --- | --- |
| Shape | `trivial`, `bounded`, `feature`, `architectural` | How much coherent engineering work exists? |
| Risk | `low`, `medium`, `high`, `protected` | What happens if the change is wrong? |
| Uncertainty | `low`, `medium`, `high` | Are requirements, destination, and design already settled? |
| Locality | `isolated`, `cross-module`, `cross-system` | How far can the change propagate? |

Use the highest applicable risk. A one-line authentication or release change is
not low-risk merely because it is small. A broad mechanical rename is not
architectural merely because it touches many files.

Before acting, record a compact route decision in the conversation, Run, or
Issue when one exists:

```text
Route: direct | single-worker | task-dag | decision-first
Shape/Risk/Uncertainty/Locality: <values>
Issue/Run: <ids or not-required>
Verification: targeted | module | full
Review: none | coordinator | independent
Budgets: workers <n>; blocking review rounds <n>
Reason: <one sentence>
```

## Minimum routes

| Conditions | Route | Durable work | Verification | Review |
| --- | --- | --- | --- | --- |
| Trivial, low-risk, low-uncertainty, isolated | Direct coordinator execution | No Issue or Run required | Targeted deterministic check | None |
| Bounded, low-risk, settled, isolated | Direct or one worker, whichever is cheaper | Use an Issue/Run when delegated or when the work is already Issue-owned | Targeted or module checks | Coordinator acceptance |
| Bounded with medium risk or cross-module locality | One worker unless exact shared state makes direct execution safer | Claimed Issue and one execution Run | Module checks plus affected integration checks | Coordinator; independent only for a stated risk |
| Feature with settled requirements | Minimum shallow Task DAG | Approved Issue and one execution Run | Acceptance-driven checks | Risk-based |
| Architectural or high-uncertainty | Decision-first; grill/spec only as needed | Durable decision/spec before implementation | Defined by the approved contract | Independent when high-risk |
| High-risk | Route appropriate to shape, with an independent reviewer | Claimed Issue and one execution Run | Targeted plus relevant full checks | Fresh independent review |
| Protected mutation | Pause at the mutation boundary | Existing authority plus immediate confirmation | Exact precondition checks | As required by risk |

The direct route is unavailable when the work changes security assumptions,
authentication, public interfaces, persistent data, release/deployment behavior,
architectural seams, or broad cross-cutting behavior. It is also unavailable
when requirements are unresolved. Escalate the route instead of stretching the
definition of trivial.

Campaign membership never raises review risk by itself. Classify each active
Issue independently.

## Worker and reasoning budgets

- Start no worker for a direct route.
- Start at most one implementation worker for bounded work.
- Create a Task DAG only when ownership and verification are genuinely
  separable; parallel Tasks must remain non-overlapping.
- Use Luna for clear exploration and implementation, Terra when local judgment
  is material, and Sol for architectural decisions and fresh high-risk review.
- Do not use `xhigh` or `max` by default. State the difficulty that warrants it.
- A worker retry needs new evidence or a changed contract. Repeating the same
  request is not a recovery strategy.
- Two equivalent blocking review rounds pause the Issue for a coordinator
  decision. They do not trigger a third correction/review cycle automatically.

## Verification scope

Verification scales with impact, not ceremony:

- **Targeted:** the closest deterministic check for the changed behavior, plus
  syntax/format checks relevant to the touched artifact.
- **Module:** targeted checks plus the owning package/module tests and static
  checks.
- **Full:** the repository acceptance suite, build, release, or integration
  checks required by the Issue's risk.

A smaller route never permits weaker evidence for the behavior it changes. A
full suite is not automatic when targeted evidence is sufficient, and passing a
full suite does not replace a missing focused regression check.

## Context contract

A Dispatch receives the smallest sufficient context:

```text
objective
acceptance criteria
owned scope
constraints and exclusions
relevant source or evidence pointers
verification commands
escalation conditions
expected bounded report
```

Prefer pointers and selected excerpts over copied documents. Do not inject raw
conversation history, complete terminal logs, global worker/Run inventories, or
unfiltered memory. A completion report contains one concise result per
acceptance criterion and verification command; attach only the failure excerpt
needed to diagnose a failed check.

## Coordinator checkpoints

The coordinator is one logical owner, not necessarily one unbounded physical
session. Write a durable checkpoint before replacing or compacting its context:

```text
Issue and Run
current objective and route
settled decisions
completed and pending Tasks
candidate identity
open finding IDs
verification state
next action
known risks or blockers
```

Checkpoint at every Campaign Issue boundary and before continuing when the host
reports that context is materially full, repeated review has begun, or tool
output dominates the useful history. Start the replacement session from the
checkpoint and canonical artifacts, not from the transcript. Session renewal
does not transfer coordinator ownership or create another Issue-owned Run.

## Candidate identity and review receipts

A review verdict and verification result authorize only the exact candidate
they inspected.

- For a committed candidate, use the full commit ID and its tree ID.
- For WIP, use the fixed base plus a SHA-256 identity of the complete captured
  snapshot: committed comparison, staged changes, unstaged changes, and every
  untracked path and its bytes. Generate the reproducible identity with
  `node .agents/scripts/candidate-id.mjs <fixed-point>`.
- Recompute the candidate identity immediately before integration. Any mismatch
  invalidates the prior verification and review evidence affected by the change.

Record this minimum receipt:

```yaml
candidate:
  id: <commit-and-tree or wip-sha256>
  base: <full commit>
issue: <number or not-required>
run: <id or not-required>
verification:
  scope: targeted | module | full
  commands: [<command and result>]
review:
  required: true | false
  mode: none | coordinator | full | delta
  verdict: SHIP | FIX_FIRST | RETHINK | not-required
  findings: [<stable finding IDs>]
```

The coordinator owns the receipt and delivery decision. A reviewer reports
evidence for its candidate but cannot authorize a later candidate.

## Correction and delta review

Every blocking finding has a stable ID, severity, evidence location, violated
rule or requirement, and acceptance condition. A correction Task receives only
those findings and the context needed to fix them.

Use delta review when all changes since the prior candidate are confined to the
authorized finding IDs. The reviewer checks the correction diff, the original
findings, affected tests, and regressions caused by the correction. Require a
new full review when the correction changes unrelated paths, public or persistent
contracts, architecture, security assumptions, or the previously assessed blast
radius.

`FIX_FIRST` counts as a blocking round. After two equivalent blocking rounds,
pause for a requirement, architecture, task-contract, or reviewer-scope decision.
`RETHINK` always pauses immediately and is never retried.
