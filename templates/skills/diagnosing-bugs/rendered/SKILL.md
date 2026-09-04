---
name: diagnosing-bugs
description: Diagnosis loop for hard bugs and performance regressions, with an explicit diagnosis-only or authorized-fix mode.
---

# Diagnosing Bugs

Read `AGENTS.md` and, when present, `docs/agents/orca-execution.md` before routing work.
This procedure is a tight feedback loop, not permission to edit product code. Determine
the mode first:

- **Diagnosis-only (default):** reproduce, minimize, rank hypotheses, instrument safely,
  and report evidence plus a recommended fix. Do not modify product code.
- **Authorized fix:** the user or the Dispatch contract explicitly authorizes a fix. The
  same evidence loop applies, then the regression test and smallest fix may be made
  within the owned scope.

When exploring the codebase, read `CONTEXT.md` if it exists to orient to the relevant
modules, and inspect ADRs in the area being diagnosed before interpreting behavior.

## Routing and ownership

In coordinator mode, bind the diagnosis to its issue and use Orca Tasks for bounded
evidence collection or an authorized correction. Answer a worker question in its
Dispatch, or handle an escalation by narrowing the contract, creating a correction Task,
or making an architectural decision; record the outcome in the Run/issue.

When `docs/agents/execution-policy.md` records a continuation envelope, a coordinator may
directly repair a new deterministic, low-risk test/build/CI harness defect inside its
named surfaces and budgets. This is not authority to alter product behavior or to bypass
a recurrence limit, remove coverage, weaken evidence, or relax acceptance. Give a
different causal failure in a newly reached pipeline stage a new finding ID; do not count
it as another occurrence of the resolved blocker.

In worker mode, inspect only the dispatched scope. Use the Dispatch to ask when a
requirement, repro, or permission to fix is unclear; escalate before changing scope,
architecture, a public interface, persistent data, or a security assumption. Do not
create Runs or Tasks, launch workers, review autonomously, stage, commit, or update the
issue as owner. Send exactly one completion report when the bounded work is done.

## Redact before showing evidence

Redact secrets, tokens, credentials, personal data, and authorization headers in commands,
logs, traces, screenshots, and saved artifacts. Use `<REDACTED>` and keep credentials in
environment variables. If redaction removes the signal, say what evidence is missing and
request a safe capture. Never copy production secrets into a fixture or report.

## Phase 1: build a red-capable feedback loop

Spend disproportionate effort on one fast, deterministic command that drives the actual
bug path and asserts the user's exact symptom. Try, in order:

1. a failing test at the seam that reaches the bug;
2. a curl/HTTP script against a running development server;
3. a CLI fixture with known-good output;
4. a browser script asserting DOM, console, and network behavior;
5. a replay of a redacted trace or event log;
6. a minimal throwaway harness around the real bug path;
7. a property loop for wrong-output bugs;
8. a pinned bisection harness when the regression range is known;
9. an old-versus-new differential run;
10. the repository's human-in-the-loop template only when a click is unavoidable.

Tighten the loop by narrowing setup, sharpening the assertion, pinning time and random
seeds, and isolating network/filesystem state. For intermittent bugs, repeat the trigger
and increase reproduction rate while retaining deterministic verdicts. Do not proceed to
theory until one command has run once, is red-capable, agent-runnable, and fast enough to
iterate.

For a sequential build or CI pipeline, record the furthest successful stage and target
the first failing stage. When multiple matrix jobs show the same error signature, inspect
one representative log deeply and confirm the other jobs from concise status/signature
evidence. Do not load every complete log into context.

If no loop can be built, stop with the attempted approaches and request one of: access
to the reproducing environment, a redacted HAR/log/core/screen capture with timestamps,
or explicit authorization for temporary production instrumentation.

## Phase 2: reproduce and minimize

Run the loop repeatedly and confirm it produces the user's failure, not a nearby error.
Capture the exact error, wrong output, or performance measurement. Remove one input,
caller, configuration value, data item, or step at a time; rerun after every removal.
Keep only load-bearing elements. The minimized repro becomes the regression scenario.

For performance regressions, establish a baseline timing, profiler result, query plan, or
other measurement before changing code. Measure one variable at a time.

## Phase 3: rank falsifiable hypotheses

When multiple plausible causes remain, write three to five ranked hypotheses before
probing. For a deterministic failure whose cause is already directly evidenced by the
error, source, and a falsifiable command, one explicit hypothesis is sufficient. Each
hypothesis must state a prediction:
“If X causes the bug, changing Y will make the symptom disappear or changing Z will make
it worse.” Show the list to the user or coordinator when their domain context can re-rank
it, then proceed with the current ranking if they are unavailable. Discard vibes that
cannot be falsified.

## Phase 4: instrument one prediction at a time

Choose the least invasive probe that distinguishes the next hypothesis: debugger/REPL,
then targeted logs at the relevant seam. Tag every temporary log with a unique prefix
such as `[DEBUG-a4f2]`; never log secrets. For performance work, prefer measurement or a
profiler to logging. Record which prediction each probe tests.

## Phase 5: authorized fix and regression protection

Only enter this phase when fix authority is explicit. If a correct seam exists, write the
regression test from the minimized repro, watch it fail, apply the smallest fix, watch it
pass, and rerun the original unminimized loop. If no correct seam exists, document that
architecture prevents a trustworthy regression test and escalate that finding instead of
adding a shallow test.

After the fix, expand verification progressively. Prefer a representative remote canary
or affected cells before a complete matrix when the repository supports that selection.
If a changed candidate reveals a different deterministic harness defect inside the
continuation envelope, diagnose and continue within its remaining budget. Rerun unchanged
bytes only for evidenced infrastructure or intermittent failures.

Diagnosis-only work stops with evidence, ranked hypotheses, likely cause, and a proposed
next Task. It does not opportunistically fix adjacent code.

## Phase 6: clean up and report

Before completion, rerun the original loop, confirm the regression test or the missing
seam is documented, remove every tagged log and temporary artifact, and redact the report.
Report the hypothesis that proved correct, exact commands and results, changed files (if
an authorized fix was made), unresolved uncertainty, and intentionally undone work. A
worker reports through Orca; a coordinator also updates the issue and decides whether
review is warranted under the risk policy.
