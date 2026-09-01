import type { CampaignAuthorization, ProtectedMutation } from './planning.js';

export type CampaignStatus = 'proposed' | 'active' | 'paused' | 'cancelled' | 'completed';
export type CampaignIssueStatus = 'future' | 'ready' | 'active' | 'issue-paused' | 'accepted' | 'cancelled';
export type RethinkScope = 'issue-local' | 'transversal';

export interface ReconstructedCampaignIssue {
  readonly issueNumber: number;
  readonly status: CampaignIssueStatus;
  readonly blockersResolved: boolean;
  readonly runId?: string;
  readonly sameContextFailures: number;
  readonly lastFailureContext?: string;
  readonly verificationPassed: boolean;
  readonly reviewRequired?: boolean;
  readonly reviewVerdict?: 'SHIP' | 'FIX_FIRST' | 'RETHINK';
  readonly integrationCommit?: string;
  readonly integrationCommitCount?: number;
  /** The value must identify the Campaign coordinator, never a worker. */
  readonly integrationCommitOwner?: string;
  readonly integrationCommitLocation?: 'authorized-remote-target' | 'local-only' | 'temporary-branch';
  readonly targetIdentityRevalidated?: boolean;
  readonly revalidatedTargetRemote?: string;
  readonly revalidatedTargetBranch?: string;
  readonly containedInRemoteTarget: boolean;
  readonly terminalId?: string;
  readonly worktreePath?: string;
  readonly assignedTo?: string;
  readonly cancellationEvidenceRecorded?: boolean;
}

export interface ReconstructedCampaignState {
  /** The authorization is immutable; all progress is reconstructed around it. */
  readonly authorization: CampaignAuthorization;
  readonly status: CampaignStatus;
  readonly issues: readonly ReconstructedCampaignIssue[];
  readonly activeIssueNumber?: number | undefined;
  /** Internal Task slots, not cross-Issue Campaign concurrency. */
  readonly activeInternalWorkers: number;
  readonly pendingProtectedMutation?: ProtectedMutation | undefined;
  readonly immutableRecordPresent?: boolean;
  readonly cancellationEvidenceRecorded?: boolean;
  readonly rollbackPerformed?: boolean;
  readonly releasedTerminalIds?: readonly string[];
  readonly releasedWorktreePaths?: readonly string[];
  readonly pauseReason?: string | undefined;
}

export type CampaignEvent =
  | { readonly type: 'authorization-confirmed' }
  | { readonly type: 'dependency-resolved'; readonly issueNumber: number }
  | { readonly type: 'issue-pause'; readonly issueNumber: number; readonly reason: string }
  | { readonly type: 'campaign-pause'; readonly reason: string }
  | { readonly type: 'protected-mutation-requested'; readonly mutation: ProtectedMutation }
  | { readonly type: 'protected-mutation-confirmed'; readonly mutation: ProtectedMutation }
  | { readonly type: 'worker-failed'; readonly issueNumber: number; readonly context: string }
  | {
    readonly type: 'review-returned';
    readonly issueNumber: number;
    readonly verdict: 'SHIP' | 'FIX_FIRST' | 'RETHINK';
    readonly scope?: RethinkScope;
    readonly reason?: string;
  }
  | {
    readonly type: 'rethink-returned';
    readonly issueNumber: number;
    readonly scope: RethinkScope;
    readonly reason?: string;
  }
  | { readonly type: 'acceptance-checked'; readonly issueNumber: number }
  | { readonly type: 'task-ready'; readonly issueNumber: number; readonly taskId?: string }
  | { readonly type: 'task-finished'; readonly issueNumber: number; readonly taskId?: string }
  | { readonly type: 'issue-pause-resolved'; readonly issueNumber: number }
  | { readonly type: 'resume-requested' }
  | { readonly type: 'cancel-requested' };

export type CampaignAction =
  | { readonly type: 'append-record-and-execute' }
  | { readonly type: 'start-issue'; readonly issueNumber: number }
  | { readonly type: 'add-ready-for-agent'; readonly issueNumber: number }
  | { readonly type: 'dispatch-task'; readonly issueNumber: number; readonly taskId?: string }
  | { readonly type: 'release-task-slot'; readonly issueNumber: number; readonly taskId?: string }
  | { readonly type: 'wait'; readonly reason: string }
  | { readonly type: 'pause-issue'; readonly issueNumber: number; readonly reason: string }
  | { readonly type: 'pause-campaign'; readonly reason: string }
  | { readonly type: 'request-immediate-confirmation'; readonly mutation: ProtectedMutation }
  | { readonly type: 'execute-protected-mutation'; readonly mutation: ProtectedMutation }
  | { readonly type: 'create-correction-in-same-run'; readonly issueNumber: number; readonly runId: string }
  | { readonly type: 'investigate-failure'; readonly issueNumber: number; readonly context: string }
  | { readonly type: 'keep-issue-open'; readonly issueNumber: number; readonly reason: string }
  | { readonly type: 'reuse-record-and-reconstruct' }
  | { readonly type: 'stop-new-work' }
  | { readonly type: 'release-campaign-owned-resources'; readonly issueNumber: number; readonly terminalId?: string; readonly worktreePath?: string }
  | { readonly type: 'unassign-issue'; readonly issueNumber: number }
  | { readonly type: 'record-cancellation-evidence'; readonly issueNumber: number }
  | { readonly type: 'resolve-issue-pause'; readonly issueNumber: number; readonly runId: string }
  | { readonly type: 'record-acceptance'; readonly issueNumber: number };

export interface CampaignTransition {
  readonly state: ReconstructedCampaignState;
  readonly actions: readonly CampaignAction[];
}

const noIndependentReadyReason = 'No independent authorized Campaign Issue is ready.';

function unique<T>(items: readonly T[]): readonly T[] {
  return [...new Set(items)];
}

function replaceIssue(
  state: ReconstructedCampaignState,
  issueNumber: number,
  change: (issue: ReconstructedCampaignIssue) => ReconstructedCampaignIssue,
): ReconstructedCampaignState {
  return { ...state, issues: state.issues.map((issue) => issue.issueNumber === issueNumber ? change(issue) : issue) };
}

function issueFor(state: ReconstructedCampaignState, issueNumber: number): ReconstructedCampaignIssue | undefined {
  return state.issues.find((issue) => issue.issueNumber === issueNumber);
}

function hasExistingRun(issue: ReconstructedCampaignIssue): issue is ReconstructedCampaignIssue & { readonly runId: string } {
  return typeof issue.runId === 'string' && issue.runId.trim().length > 0;
}

/**
 * Rebind the active Issue from reconstructed progress before a Campaign can
 * resume or be checkpointed. A worker count without an active Issue is stale
 * state and cannot be allowed to survive that boundary.
 */
function rebindActiveIssue(state: ReconstructedCampaignState): ReconstructedCampaignState {
  const pointed = state.activeIssueNumber === undefined ? undefined : issueFor(state, state.activeIssueNumber);
  const active = pointed?.status === 'active' && state.authorization.issueNumbers.includes(pointed.issueNumber)
    ? pointed
    : state.issues.find((issue) => (
      issue.status === 'active' && state.authorization.issueNumbers.includes(issue.issueNumber)
    ));
  if (!active) {
    return { ...state, activeIssueNumber: undefined, activeInternalWorkers: 0 };
  }
  return { ...state, activeIssueNumber: active.issueNumber };
}

function schedulable(state: ReconstructedCampaignState): ReconstructedCampaignIssue | undefined {
  if (state.activeIssueNumber !== undefined || state.issues.some((issue) => issue.status === 'active')) return undefined;
  for (const issueNumber of state.authorization.issueNumbers) {
    const issue = issueFor(state, issueNumber);
    if (issue && (issue.status === 'ready' || issue.status === 'future') && issue.blockersResolved) return issue;
  }
  return undefined;
}

function schedule(state: ReconstructedCampaignState): CampaignTransition {
  const next = schedulable(state);
  if (!next) return { state, actions: [{ type: 'wait', reason: noIndependentReadyReason }] };
  const activated = replaceIssue({ ...state, activeIssueNumber: next.issueNumber }, next.issueNumber, (issue) => ({ ...issue, status: 'active' }));
  const actions: CampaignAction[] = [];
  if (next.status === 'future') actions.push({ type: 'add-ready-for-agent', issueNumber: next.issueNumber });
  actions.push({ type: 'start-issue', issueNumber: next.issueNumber });
  return { state: activated, actions };
}

function taskAction(
  type: 'dispatch-task' | 'release-task-slot',
  issueNumber: number,
  taskId: string | undefined,
): CampaignAction {
  return taskId === undefined ? { type, issueNumber } : { type, issueNumber, taskId };
}

function acceptanceGaps(state: ReconstructedCampaignState, issue: ReconstructedCampaignIssue): readonly string[] {
  const gaps: string[] = [];
  if (!state.authorization.issueNumbers.includes(issue.issueNumber)
    || state.activeIssueNumber !== issue.issueNumber
    || issue.status !== 'active') {
    gaps.push('exact active Campaign Issue');
  }
  if (!hasExistingRun(issue)) gaps.push('existing Issue-owned Run');
  if (state.activeInternalWorkers !== 0) gaps.push('all active internal Task slots settled');
  if (issue.verificationPassed !== true) gaps.push('verification');

  const reviewRequired = issue.reviewRequired ?? true;
  if ((reviewRequired && issue.reviewVerdict !== 'SHIP')
    || (!reviewRequired && issue.reviewVerdict !== undefined && issue.reviewVerdict !== 'SHIP')) {
    gaps.push('required SHIP review');
  }

  const coordinatorOwned = issue.integrationCommitOwner === 'coordinator'
    || (state.authorization.coordinator !== undefined && issue.integrationCommitOwner === state.authorization.coordinator);
  if (!issue.integrationCommit || issue.integrationCommitCount !== 1 || !coordinatorOwned) {
    gaps.push('exactly one coordinator-owned integration commit');
  }

  if (issue.targetIdentityRevalidated !== true
    || issue.revalidatedTargetRemote !== state.authorization.repository.remote
    || issue.revalidatedTargetBranch !== state.authorization.repository.targetBranch) {
    gaps.push('trustworthy revalidated target identity');
  }

  if (issue.integrationCommitLocation !== 'authorized-remote-target') {
    gaps.push('remote target commit rather than local-only or temporary branch');
  }
  if (issue.containedInRemoteTarget !== true) gaps.push('containment in the authorized remote target branch');
  return gaps;
}

function resolveIssuePauseTransition(
  state: ReconstructedCampaignState,
  issueNumber: number,
): CampaignTransition {
  if (!state.authorization.issueNumbers.includes(issueNumber)) {
    return { state, actions: [{ type: 'wait', reason: 'Issue Pause resolution is outside fixed Campaign membership.' }] };
  }
  const issue = issueFor(state, issueNumber);
  if (!issue || issue.status !== 'issue-paused') {
    return { state, actions: [{ type: 'wait', reason: 'Issue Pause resolution requires a reconstructed issue-paused member.' }] };
  }
  if (!hasExistingRun(issue)) {
    return { state, actions: [{ type: 'wait', reason: 'Issue Pause resolution requires the existing Issue-owned Run.' }] };
  }
  const noIndependentCampaignPause = state.status === 'paused'
    && state.pendingProtectedMutation === undefined
    && state.pauseReason === noIndependentReadyReason;
  if (state.status !== 'active' && !noIndependentCampaignPause) {
    return {
      state,
      actions: [{ type: 'wait', reason: 'Issue Pause resolution requires an active Campaign or its no-independent-work Campaign Pause.' }],
    };
  }
  const resolved = replaceIssue({
    ...state,
    status: 'active',
    pauseReason: undefined,
  }, issueNumber, (candidate) => ({
    ...candidate,
    status: candidate.blockersResolved ? 'ready' : 'future',
  }));
  const next = schedule(resolved);
  return {
    state: next.state,
    actions: [{ type: 'resolve-issue-pause', issueNumber, runId: issue.runId }, ...next.actions],
  };
}

function pauseIssueTransition(
  state: ReconstructedCampaignState,
  issueNumber: number,
  reason: string,
): CampaignTransition {
  const checkpointed = rebindActiveIssue(state);
  const pausingActiveIssue = checkpointed.activeIssueNumber === issueNumber;
  const paused = replaceIssue({
    ...checkpointed,
    activeIssueNumber: pausingActiveIssue ? undefined : checkpointed.activeIssueNumber,
    activeInternalWorkers: pausingActiveIssue ? 0 : checkpointed.activeInternalWorkers,
  }, issueNumber, (issue) => ({ ...issue, status: 'issue-paused' }));
  const next = schedule(paused);
  const noActiveAuthorizedIssue = next.state.activeIssueNumber === undefined
    && !next.state.issues.some((issue) => (
      state.authorization.issueNumbers.includes(issue.issueNumber)
        && issue.status === 'active'
    ));
  if (noActiveAuthorizedIssue) {
    return {
      state: { ...paused, status: 'paused', pauseReason: noIndependentReadyReason },
      actions: [
        { type: 'pause-issue', issueNumber, reason },
        { type: 'pause-campaign', reason: noIndependentReadyReason },
      ],
    };
  }
  return {
    state: next.state,
    actions: [{ type: 'pause-issue', issueNumber, reason }, ...next.actions],
  };
}

function pauseCampaignTransition(
  state: ReconstructedCampaignState,
  reason: string,
): CampaignTransition {
  const checkpointed = rebindActiveIssue(state);
  return {
    state: { ...checkpointed, status: 'paused', pauseReason: reason },
    actions: [{ type: 'pause-campaign', reason }],
  };
}

function rethinkTransition(
  state: ReconstructedCampaignState,
  issueNumber: number,
  scope: RethinkScope,
  reason: string,
): CampaignTransition {
  const reviewed = replaceIssue(state, issueNumber, (issue) => ({ ...issue, reviewVerdict: 'RETHINK' }));
  if (scope === 'transversal') {
    return pauseCampaignTransition(reviewed, reason);
  }
  return pauseIssueTransition(reviewed, issueNumber, reason);
}

function cancelCampaign(state: ReconstructedCampaignState): CampaignTransition {
  const unaccepted = state.issues.filter((issue) => (
    state.authorization.issueNumbers.includes(issue.issueNumber) && issue.status !== 'accepted'
  ));
  const actions: CampaignAction[] = [{ type: 'stop-new-work' }];
  const releasedTerminals: string[] = [...(state.releasedTerminalIds ?? [])];
  const releasedWorktrees: string[] = [...(state.releasedWorktreePaths ?? [])];
  const cancelledIssues = new Set(unaccepted.map((issue) => issue.issueNumber));
  const issues = state.issues.map((issue) => {
    const terminalId = issue.terminalId;
    const worktreePath = issue.worktreePath;
    const member = state.authorization.issueNumbers.includes(issue.issueNumber);
    if (member && (terminalId !== undefined || worktreePath !== undefined)) {
      const resourceAction: CampaignAction = {
        type: 'release-campaign-owned-resources',
        issueNumber: issue.issueNumber,
        ...(terminalId === undefined ? {} : { terminalId }),
        ...(worktreePath === undefined ? {} : { worktreePath }),
      };
      actions.push(resourceAction);
      if (terminalId !== undefined) releasedTerminals.push(terminalId);
      if (worktreePath !== undefined) releasedWorktrees.push(worktreePath);
    }
    if (!cancelledIssues.has(issue.issueNumber)) {
      if (member && (terminalId !== undefined || worktreePath !== undefined)) {
        const {
          terminalId: _terminalId,
          worktreePath: _worktreePath,
          ...withoutResources
        } = issue;
        return withoutResources;
      }
      return issue;
    }
    if (issue.assignedTo !== undefined) actions.push({ type: 'unassign-issue', issueNumber: issue.issueNumber });
    actions.push({ type: 'record-cancellation-evidence', issueNumber: issue.issueNumber });
    const {
      assignedTo: _assignedTo,
      terminalId: _terminalId,
      worktreePath: _worktreePath,
      ...withoutOwnership
    } = issue;
    const cancelled: ReconstructedCampaignIssue = {
      ...withoutOwnership,
      status: 'cancelled' as const,
      cancellationEvidenceRecorded: true,
    };
    return cancelled;
  });
  return {
    state: {
      ...state,
      status: 'cancelled',
      activeIssueNumber: undefined,
      activeInternalWorkers: 0,
      pendingProtectedMutation: undefined,
      issues,
      cancellationEvidenceRecorded: true,
      rollbackPerformed: false,
      releasedTerminalIds: unique(releasedTerminals),
      releasedWorktreePaths: unique(releasedWorktrees),
    },
    actions,
  };
}

/** A pure reducer over GitHub/Orca-reconstructed state. It performs no adapter work. */
export function advanceCampaign(state: ReconstructedCampaignState, event: CampaignEvent): CampaignTransition {
  if (event.type === 'authorization-confirmed') {
    if (state.status !== 'proposed') return { state, actions: [{ type: 'wait', reason: 'Campaign authorization is no longer proposed.' }] };
    return { state: { ...state, status: 'active' }, actions: [{ type: 'append-record-and-execute' }] };
  }

  if (event.type === 'cancel-requested') {
    if (state.status === 'completed') return { state, actions: [{ type: 'wait', reason: 'Completed Campaigns cannot be cancelled.' }] };
    if (state.status === 'cancelled') return { state, actions: [{ type: 'wait', reason: 'Campaign is already cancelled.' }] };
    return cancelCampaign(state);
  }

  if (event.type === 'protected-mutation-requested') {
    if (state.status !== 'active') return { state, actions: [{ type: 'wait', reason: 'Campaign is not active.' }] };
    if (state.pendingProtectedMutation !== undefined) {
      return { state, actions: [{ type: 'wait', reason: 'Another Protected Mutation is already awaiting confirmation.' }] };
    }
    return {
      state: { ...state, status: 'paused', pendingProtectedMutation: event.mutation, pauseReason: `Awaiting confirmation for ${event.mutation}.` },
      actions: [{ type: 'request-immediate-confirmation', mutation: event.mutation }],
    };
  }

  if (event.type === 'protected-mutation-confirmed') {
    if (state.status === 'cancelled' || state.status === 'completed') {
      return { state, actions: [{ type: 'wait', reason: 'Cancelled or completed Campaigns cannot execute Protected Mutations.' }] };
    }
    if (state.status !== 'paused') return { state, actions: [{ type: 'wait', reason: 'Campaign has no Protected Mutation pause.' }] };
    if (state.pendingProtectedMutation !== event.mutation) {
      return { state, actions: [{ type: 'wait', reason: 'Confirmation does not match the pending Protected Mutation.' }] };
    }
    return {
      state: { ...state, status: 'active', pendingProtectedMutation: undefined, pauseReason: undefined },
      actions: [{ type: 'execute-protected-mutation', mutation: event.mutation }],
    };
  }

  if (event.type === 'resume-requested') {
    if (state.status !== 'paused') return { state, actions: [{ type: 'wait', reason: 'Only a paused Campaign can resume.' }] };
    if (state.pendingProtectedMutation !== undefined) {
      return { state, actions: [{ type: 'wait', reason: 'Confirm the pending Protected Mutation before resuming.' }] };
    }
    if (state.immutableRecordPresent === false) {
      return { state, actions: [{ type: 'wait', reason: 'Resume requires the existing immutable Campaign Record.' }] };
    }
    if (state.pauseReason === noIndependentReadyReason && state.issues.some((issue) => (
      state.authorization.issueNumbers.includes(issue.issueNumber) && issue.status === 'issue-paused'
    ))) {
      return { state, actions: [{ type: 'wait', reason: 'Resolve the Issue Pause explicitly before resuming the Campaign.' }] };
    }
    const resumed = rebindActiveIssue({ ...state, status: 'active', pauseReason: undefined });
    // An active Issue is a checkpoint, not a scheduling gap. Reuse its
    // existing Run and Task slots so resumed task events remain routable.
    const next = resumed.activeIssueNumber === undefined
      ? schedule(resumed)
      : { state: resumed, actions: [] as readonly CampaignAction[] };
    return { state: next.state, actions: [{ type: 'reuse-record-and-reconstruct' }, ...next.actions] };
  }

  if (event.type === 'issue-pause-resolved') {
    return resolveIssuePauseTransition(state, event.issueNumber);
  }

  if (state.status !== 'active') return { state, actions: [{ type: 'wait', reason: 'Campaign is not active.' }] };

  if (event.type === 'campaign-pause') {
    return pauseCampaignTransition(state, event.reason);
  }

  if (event.type === 'task-ready') {
    if (state.activeIssueNumber === undefined) {
      return { state, actions: [{ type: 'wait', reason: 'No Issue is active for Task dispatch.' }] };
    }
    if (event.issueNumber !== state.activeIssueNumber) {
      return { state, actions: [{ type: 'wait', reason: 'Task belongs to a non-active Campaign Issue.' }] };
    }
    const issue = issueFor(state, event.issueNumber);
    if (!issue || issue.status !== 'active') {
      return { state, actions: [{ type: 'wait', reason: 'Task belongs to an Issue that is not active.' }] };
    }
    if (state.activeInternalWorkers >= state.authorization.inheritedInternalWorkerLimit) {
      return { state, actions: [{ type: 'wait', reason: 'Active internal Task concurrency limit reached.' }] };
    }
    return {
      state: { ...state, activeInternalWorkers: state.activeInternalWorkers + 1 },
      actions: [taskAction('dispatch-task', event.issueNumber, event.taskId)],
    };
  }

  if (event.type === 'task-finished') {
    if (state.activeIssueNumber !== event.issueNumber || state.activeInternalWorkers < 1) {
      return { state, actions: [{ type: 'wait', reason: 'No active Task slot belongs to this Issue.' }] };
    }
    return {
      state: { ...state, activeInternalWorkers: state.activeInternalWorkers - 1 },
      actions: [taskAction('release-task-slot', event.issueNumber, event.taskId)],
    };
  }

  if (event.type === 'dependency-resolved') {
    if (!state.authorization.issueNumbers.includes(event.issueNumber)) {
      return { state, actions: [{ type: 'wait', reason: 'Dependency update is outside fixed Campaign membership.' }] };
    }
    const prior = issueFor(state, event.issueNumber);
    if (!prior) return { state, actions: [{ type: 'wait', reason: 'Dependency update is outside reconstructed Campaign state.' }] };
    const becameReady = prior.status === 'future';
    const unblocked = replaceIssue(state, event.issueNumber, (issue) => ({
      ...issue,
      blockersResolved: true,
      status: issue.status === 'future' ? 'ready' : issue.status,
    }));
    const next = schedule(unblocked);
    const readiness: CampaignAction[] = becameReady ? [{ type: 'add-ready-for-agent', issueNumber: event.issueNumber }] : [];
    return { state: next.state, actions: [...readiness, ...next.actions] };
  }

  if (event.type === 'issue-pause') {
    if (!state.authorization.issueNumbers.includes(event.issueNumber)) {
      return { state, actions: [{ type: 'wait', reason: 'Pause is outside fixed Campaign membership.' }] };
    }
    return pauseIssueTransition(state, event.issueNumber, event.reason);
  }

  if (event.type === 'worker-failed') {
    const prior = issueFor(state, event.issueNumber);
    if (!prior) return { state, actions: [{ type: 'wait', reason: 'Failure is outside fixed Campaign membership.' }] };
    const failures = prior.lastFailureContext === event.context ? prior.sameContextFailures + 1 : 1;
    const withFailure = replaceIssue({ ...state, activeInternalWorkers: Math.max(0, state.activeInternalWorkers - 1) }, event.issueNumber, (issue) => ({
      ...issue,
      sameContextFailures: failures,
      lastFailureContext: event.context,
    }));
    if (failures >= 3) {
      return pauseIssueTransition(withFailure, event.issueNumber, 'Three same-context failures require a decision.');
    }
    return {
      state: withFailure,
      actions: [{ type: 'investigate-failure', issueNumber: event.issueNumber, context: event.context }],
    };
  }

  if (event.type === 'review-returned' || event.type === 'rethink-returned') {
    const issueNumber = event.issueNumber;
    const issue = issueFor(state, issueNumber);
    if (!issue) return { state, actions: [{ type: 'wait', reason: 'Review is outside fixed Campaign membership.' }] };
    const verdict = event.type === 'rethink-returned' ? 'RETHINK' : event.verdict;
    if (verdict === 'RETHINK') {
      return rethinkTransition(state, issueNumber, event.type === 'rethink-returned' ? event.scope : event.scope ?? 'issue-local', event.reason ?? 'RETHINK requires an architectural or requirement decision.');
    }
    const reviewed = replaceIssue(state, issueNumber, (candidate) => ({ ...candidate, reviewVerdict: verdict }));
    if (verdict === 'FIX_FIRST' && issue.runId) {
      return { state: reviewed, actions: [{ type: 'create-correction-in-same-run', issueNumber, runId: issue.runId }] };
    }
    if (verdict === 'FIX_FIRST') {
      return { state: reviewed, actions: [{ type: 'wait', reason: 'FIX_FIRST requires the existing Issue-owned Run.' }] };
    }
    return { state: reviewed, actions: [{ type: 'wait', reason: 'Review evidence recorded.' }] };
  }

  if (event.type === 'acceptance-checked') {
    const issue = issueFor(state, event.issueNumber);
    if (!issue) return { state, actions: [{ type: 'wait', reason: 'Acceptance is outside fixed Campaign membership.' }] };
    const gaps = acceptanceGaps(state, issue);
    if (gaps.length > 0) {
      return {
        state,
        actions: [{ type: 'keep-issue-open', issueNumber: event.issueNumber, reason: `Acceptance prerequisites missing: ${gaps.join('; ')}.` }],
      };
    }
    const done = replaceIssue({ ...state, activeIssueNumber: undefined, activeInternalWorkers: 0 }, event.issueNumber, (candidate) => ({ ...candidate, status: 'accepted' }));
    const allAccepted = state.authorization.issueNumbers.every((number) => issueFor(done, number)?.status === 'accepted');
    if (allAccepted) return { state: { ...done, status: 'completed' }, actions: [{ type: 'record-acceptance', issueNumber: event.issueNumber }] };
    const next = schedule(done);
    return { state: next.state, actions: [{ type: 'record-acceptance', issueNumber: event.issueNumber }, ...next.actions] };
  }

  return { state, actions: [{ type: 'wait', reason: 'No lifecycle transition matched.' }] };
}
