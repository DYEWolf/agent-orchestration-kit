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

## Continuation envelopes

When the user authorizes an end-to-end outcome or resumes a failed gate, record
a bounded continuation envelope instead of asking again after every new
mechanical failure:

```text
Owned surfaces: <product | tests | build | CI harness | docs>
Allowed corrections: <classes that may proceed without another decision>
Budgets: direct corrections <n>; workers <n>; remote executions <n>
Authorized external actions: <push/workflow/PR actions or none>
Stop when: <recurrence, scope expansion, ambiguity, protected mutation, budget>
```

The envelope never grants blanket retry authority or expands the user's
requested outcome. It only avoids artificial pauses for low-risk corrections
whose class, surfaces, external effects, and limits were already authorized.

Classify a failed gate before spending another Task or remote run:

- **Recurrence:** the same stable finding or causal mechanism failed again.
  Increment its counter and pause at the configured limit.
- **New downstream finding:** a later stage became reachable after the previous
  blocker was fixed and failed for a different cause. Give it a new stable ID;
  do not count it as recurrence of the resolved finding.
- **Infrastructure failure:** the candidate did not cause a trustworthy product
  verdict. Rerun unchanged bytes only when the evidence supports this class.
- **Scope expansion:** the correction would cross the recorded surfaces or
  change product behavior, architecture, dependencies, security assumptions, or
  a public/persistent contract. Pause for a new decision.

Inside an Issue-owned Run, the coordinator may directly repair a new,
deterministic test/build/CI harness defect when the continuation envelope names
that surface, the change is low-risk and mechanical, and no product behavior is
altered. The correction must preserve required coverage, evidence, and
acceptance criteria. Do not create a Task, worker, or reviewer solely to apply
such a fix. Candidate-changing corrections still invalidate affected evidence
and consume the recorded correction and remote-execution budgets.

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

### Progressive remote verification

Use the cheapest available gate that can falsify the current candidate, then
expand only after it passes:

```text
local focused check
  -> representative remote OS/runtime canary when supported
  -> affected remote cells
  -> complete required matrix on the final candidate
```

Do not run a complete expensive matrix after every mechanical correction when a
representative remote probe is available. Do not pretend a canary exists when
the repository cannot select one; record that limitation and use the smallest
real gate. A changed candidate needs new affected verification. An unchanged
candidate may be rerun only for evidenced infrastructure or intermittency, not
to hope that a deterministic failure disappears.

For sequential pipelines, record the furthest successful stage. A failure in a
newly reached later stage is a new downstream finding, not evidence that the
earlier resolved finding returned. When multiple jobs have the same signature,
inspect one representative failing log in detail and confirm the remaining
jobs from their concise status/error signature.

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

On resume, load the latest durable checkpoint, current candidate diff, and exact
active-failure excerpt. Do not reconstruct settled Tasks, Deliveries, or review
rounds unless the active decision depends on them. For a repeated matrix
signature, read one representative job deeply rather than copying every job log
into coordinator context.

## Coordinator checkpoints

The coordinator is one logical owner, not necessarily one unbounded physical
session. Write a durable checkpoint before replacing or compacting its context:

```text
Issue and Run
current objective and route
settled decisions
pending Tasks plus counts/pointers for settled Tasks
candidate identity
open finding IDs
verification state
continuation-envelope budget remaining
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
