---
name: campaign
description: Start, inspect, pause, resume, or cancel an explicitly authorized fixed set of GitHub implementation Issues. Use only when the user explicitly invokes Campaign.
---

# Campaign

Campaign is a bounded runtime authorization over an explicit, ordered, fixed
set of approved implementation Issues. It is not a permanent mode, a backlog
runner, or a replacement for Issue-owned Runs, and it never starts implicitly:
`$to-tickets` publishes and stops, and manual `$implement` remains the default.
Use this skill only for the user's natural-language intent to start, inspect,
pause, resume, or cancel a Campaign. The invariants in `AGENTS.md` and the
rules in `docs/agents/execution-policy.md` apply unchanged inside a Campaign.

## Start

1. Ask for the explicit ordered list of implementation Issues.
2. Run the read-only, atomic preflight in
   [preflight-and-record.md](references/preflight-and-record.md). Any invalid,
   duplicate, conflicted, incomplete, or already-owned member rejects the whole
   proposal with no effects.
3. Present the proposed authorization and ordered frontier, with the record
   anchor chosen by the rules in that reference.
4. Ask only for the relevant optional Preauthorized Mutations listed there.
   Protected Mutations are never preauthorized.
5. After the last needed answer, append the immutable Campaign Record comment
   to the anchor Issue and start the first eligible member immediately. Do not
   ask a second confirmation. Membership is fixed from this point.

## Operate

Follow [lifecycle.md](references/lifecycle.md) for every gate, failure, review
result, acceptance, pause, resume, and cancel. The short form:

- Reconstruct status from GitHub and Orca; there is no mutable status ledger.
- One active Issue at a time; each keeps its own single execution Run and its
  minimum Task DAG, classified independently by the execution policy.
- Acceptance is two-phase: prove the candidate is integrated and contained in
  the authorized remote target, then reconcile every Issue-owned resource and
  record its disposition. Never discard unique bytes to advance.
- After acceptance, immediately execute the frontier's `add-ready-for-agent`
  and `start-issue` actions for the next eligible member. Ask for a new prompt
  only at an explicit user boundary, an Issue/Campaign Pause, a Protected
  Mutation, exhausted authorization, or when no eligible member remains.
- Write the coordinator checkpoint at every Issue boundary.

## Pause, resume, cancel

Issue Pause blocks one member and lets an independent member run; Campaign
Pause stops everything. Resume reuses the immutable record and existing Runs.
Cancel stops new work, releases Campaign-owned resources, unassigns unaccepted
members, records incomplete evidence, preserves accepted evidence, and never
rolls back. Details and event names are in the lifecycle reference.
