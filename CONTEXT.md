# Agent Orchestration Kit

This context defines the durable language for configuring and operating the
repository's agent-orchestration workflow.

## Language

**Living Fixture**:
A repository-local canonical artifact whose exact content defines the
corresponding fresh-install output and detects generator drift.
_Avoid_: Golden copy, duplicate template

**Campaign**:
A bounded execution authorization over an explicit, fixed set of approved
implementation Issues. It advances those Issues toward acceptance without
silently expanding its membership.
_Avoid_: Autopilot, backlog run, automatic mode

**Campaign Authorization**:
The explicit grant that fixes a Campaign's Issue membership, allowed mutations,
and mandatory pauses. It does not replace or broaden the execution environment's
technical permission controls.
_Avoid_: YOLO mode, blanket approval, permanent enablement

**Preauthorized Mutation**:
An optional external action disclosed and granted when a Campaign starts, such
as pushing integration commits or maintaining an authorized pull request.
_Avoid_: Protected mutation, implicit permission

**Protected Mutation**:
An external, global, destructive, publishing, deployment, secret, or protection
change that requires confirmation immediately before execution even during an
active Campaign.
_Avoid_: Preauthorized mutation, routine Campaign operation

**Campaign Record**:
The durable record of a Campaign Authorization. Campaign progress is derived
from the authorized GitHub Issues and their Issue-owned Orca Runs rather than
stored as a second mutable status ledger.
_Avoid_: Campaign state file, chat history, goal state

**Accepted Issue**:
A Campaign Issue whose approved outcome and verification are satisfied and
whose coordinator-owned integration change is contained in the authorized
remote target branch before the Issue is closed.
_Avoid_: Locally complete Issue, worker-complete Issue

**Issue Pause**:
A pending gate that prevents one Campaign Issue from advancing while allowing
independent authorized Issues to continue.
_Avoid_: Campaign failure, global stop

**Campaign Pause**:
A pending gate that stops the whole Campaign because its resolution may affect
multiple Issues, or because no independent authorized work remains.
_Avoid_: Issue pause, cancellation
