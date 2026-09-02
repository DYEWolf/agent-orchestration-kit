---
name: code-review
description: "Review a committed checkpoint or WIP snapshot along separate Standards and Spec axes and return SHIP, FIX_FIRST, or RETHINK."
---

# Code Review

This is a read-only review. Read `AGENTS.md`, `docs/agents/execution-policy.md`, and,
when present, `docs/agents/orca-execution.md` for the canonical Orca lifecycle and risk
policy. The coordinator decides whether review is needed, whether it is full or delta,
and which reviewer model to use; a worker performing this skill reviews only its
dispatched scope. Never edit, stage, commit, or otherwise fix the reviewed change.

## Pin a review snapshot

The Dispatch must supply a fixed point, expected candidate identity, review mode
(`full` or `delta`), and originating Issue/spec. Delta mode also supplies the prior
candidate, prior receipt, authorized finding IDs, and correction diff. Accept either of
these candidate forms:

- **Committed checkpoint:** resolve the supplied fixed point and compare
  `git diff <fixed-point>...HEAD`; record `git log <fixed-point>..HEAD --oneline`.
- **WIP snapshot:** resolve the supplied fixed point, record `git status --short`, and
  capture both the committed comparison and the current staged and unstaged diffs. Then
  explicitly enumerate every untracked path (for example with
  `git ls-files --others --exclude-standard`) and inspect/capture each path's contents
  in the review evidence (for example with
  `git diff --no-index --binary /dev/null <path>`; use an appropriate binary-safe
  inspection when a patch cannot show the
  contents). Run `git diff --no-index --check /dev/null <path>` for every untracked
  path without staging or committing it; the expected difference exit status is not a
  whitespace finding, so inspect the command output for reported whitespace errors.
  Treat that complete capture as the review snapshot; do not create a commit or stage
  files merely to make the WIP reviewable.

Compute or verify the candidate identity with
`node .agents/scripts/candidate-id.mjs <fixed-point>`. If no fixed point or expected
identity is supplied, ask for it. If either does not resolve, the identity mismatches, or
the combined snapshot is empty, stop and report that prerequisite failure. For a WIP snapshot,
"combined" means the committed comparison, staged diff, unstaged diff, and the
enumerated untracked content; an untracked file with no `git diff` output still makes
the snapshot non-empty and must be reviewed. Never alter the worktree to manufacture a
diff.

## Select full or delta review

- **Full:** inspect the complete candidate against both Standards and Spec axes below.
- **Delta:** inspect the correction diff against the authorized stable finding IDs,
  their acceptance conditions, affected verification, and regressions introduced by the
  correction. Preserve the prior non-blocking findings without relitigating unchanged
  code.

Stop delta review and request full review if the correction changes unrelated paths,
architecture, public or persistent contracts, security assumptions, or the previously
assessed blast radius.

## Establish the evidence sources

1. Read `docs/agents/issue-tracker.md` and locate the originating issue from commit
   messages, the user-provided issue/spec path, or matching documentation under `docs/`,
   `specs/`, or `.scratch/`.
2. If no specification exists, keep the Spec axis and report `no spec available`; do not
   invent requirements.
3. Read the repository standards that apply to the changed files. Always include the
   smell baseline below. A documented repository rule overrides a baseline heuristic,
   and tooling-enforced concerns need not be repeated.

## Standards axis

Report hard breaches of documented standards separately from judgement-call smells.
For each finding assign a stable ID such as `STD-001`, cite the file/hunk and the rule or
smell, and state a concrete acceptance condition for its correction.
The baseline is:

- **Mysterious Name:** a name does not reveal what it holds or does; rename it.
- **Duplicated Code:** one logic shape appears in multiple changed locations; extract the
  shared shape.
- **Feature Envy:** a method reaches into another object's data more than its own; move
  behavior toward the envied data.
- **Data Clumps:** the same fields or parameters travel together; bundle them into a
  type.
- **Primitive Obsession:** a primitive stands in for a domain concept; give the concept a
  small type.
- **Repeated Switches:** the same type drives repeated conditionals; centralize the map
  or use polymorphism.
- **Shotgun Surgery:** one logical change scatters edits across many files; gather the
  change into its owning module.
- **Divergent Change:** one file changes for unrelated reasons; split the responsibilities.
- **Speculative Generality:** an abstraction serves no requirement; delete or inline it.
- **Message Chains:** callers navigate a long chain; hide the walk behind one method.
- **Middle Man:** a function mostly delegates; remove it or give it real leverage.
- **Refused Bequest:** an implementer ignores inherited behavior; prefer composition.

Baseline smells are labelled heuristics, never automatic failures. Keep the Standards
report independent from the Spec report.

## Spec axis

Compare the snapshot to the originating issue/spec and report, separately. Assign stable
IDs such as `SPEC-001` to findings:

- requested behavior or acceptance criteria that are missing or partial;
- behavior added without authorization (scope creep);
- behavior that appears implemented but is wrong, with the relevant requirement quoted or
  precisely referenced.

If the issue is ambiguous, identify the ambiguity as a question for the coordinator; do
not turn an assumption into a blocking finding without evidence.

## Aggregate and verdict

For full review, present two headings, `Standards` and `Spec`, with findings kept in their
original axis. For delta review, present each authorized finding ID and its state
(`resolved`, `unresolved`, or `regressed`), followed by any correction-induced finding.
For every finding include stable ID, severity, file/hunk, evidence, violated rule or
requirement, and acceptance condition. End with one verdict:

- **SHIP:** no unresolved blocking finding; the snapshot can proceed.
- **FIX_FIRST:** a concrete defect, hard standards breach, or missing requirement must be
  corrected before shipping. The coordinator creates or assigns a correction Task; the
  reviewer does not make it.
- **RETHINK:** the requested behavior or architecture cannot be safely satisfied by a
  local correction, or the snapshot contradicts a load-bearing decision. Return to the
  coordinator for a new decision before implementation continues.

End the report with a compact receipt containing review mode, expected and observed
candidate identity, fixed point, verification inspected, verdict, and open/resolved
finding IDs. For high-risk changes, the coordinator obtains the independent reviewer
required by `AGENTS.md` and records that evidence with the issue. Do not require a second
reviewer by ritual for routine work. A worker reviewer reports its verdict and evidence
through its Dispatch; it does not create Tasks or initiate another review cycle.
