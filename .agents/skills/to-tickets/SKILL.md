---
name: to-tickets
description: Break an explicitly approved umbrella specification into durable implementation issues with outcome-based acceptance criteria and blocking edges.
---

# To Tickets

Turn an approved umbrella/spec issue into a set of durable implementation issues. Sol remains the conversational owner: the coordinator may use Orca Tasks for bounded repository evidence, but workers do not interview the user, create nested Tasks, or decide the breakdown. Follow `docs/agents/orca-execution.md` for evidence and lifecycle details.

Read `docs/agents/issue-tracker.md` for the configured tracker. On this project, GitHub issues are the durable boundary for the approved specification and its implementation work.

## Process

### 1. Gather context

Start from the approved full specification and its comments. If the user passes an issue number or URL, fetch the complete body and comments. Preserve the project's domain vocabulary and accepted ADRs. Do not turn an unapproved draft into tickets.

### 2. Draft durable slices

Break the work into narrow, complete outcomes. Each issue must make one externally observable behavior verifiable and state:

- the outcome to deliver, from the user's perspective;
- objective acceptance criteria;
- constraints, non-goals, and relevant interfaces or seams;
- risks and their mitigations;
- deterministic verification;
- the issues that genuinely block it.

Size issues by the durable outcome, acceptance criteria, risk, and verification needed to land safely. Do not size them by a context window, session reset, token budget, model, effort, or presumed worker assignment. Runtime routing belongs to the coordinator and Orca, never in an issue body or blocking edge.

Use vertical slices where they fit. A mechanical change whose blast radius prevents a green slice may use an expand–migrate–contract sequence, with each dependency stated explicitly. An investigation or unresolved decision is not an implementation issue; keep it separate and do not mark it ready for an agent until its outcome is concrete.

### 3. Get approval

Present the proposed breakdown as a numbered list. For each issue show its title, blockers, delivered outcome, acceptance criteria, constraints, risks, and verification. Ask whether the granularity and blocking edges are correct. Revise until the user explicitly approves the complete breakdown; do not publish on implied approval.

### 4. Publish the approved issues

Create issues in dependency order so blockers have identifiers first. Keep the approved umbrella/spec issue open and unchanged. Use native GitHub blocking dependencies when available; otherwise include a `Blocked by` section with issue references. Apply `ready-for-agent` only to implementation issues whose acceptance criteria, constraints, risks, and verification are complete. Do not apply that label to umbrella, investigation, or decision issues.

After publication, stop. Dispatching and model selection are runtime coordinator actions, not ticket transitions. They occur only when the user explicitly starts implementation or an explicitly authorized end-to-end flow includes implementation.

## Issue template

## Parent

Reference the approved umbrella/spec issue.

## What to build

The end-to-end behavior this issue makes work, from the user's perspective.

## Acceptance criteria

- [ ] Observable criterion 1
- [ ] Observable criterion 2

## Constraints and non-goals

State interfaces, invariants, compatibility requirements, and explicit exclusions.

## Risks and mitigations

Identify material risks and how implementation or verification will address them.

## Verification

List deterministic checks that establish the acceptance criteria, including relevant tests, typechecks, builds, migrations, or manual checks.

## Blocked by

Reference each genuine blocking issue, or state `None (can start immediately)`.

Do not put model names, effort levels, worker routing, context-window assumptions, or session-management instructions in tickets.
