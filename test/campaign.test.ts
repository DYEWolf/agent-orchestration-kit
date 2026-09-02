import { describe, expect, it } from 'vitest';
import { advanceCampaign, type ReconstructedCampaignIssue } from '../src/campaign/lifecycle.js';
import {
  planCampaign,
  type CampaignIssueSnapshot,
  type CampaignPlanInput,
  type CampaignRecordSnapshot,
} from '../src/campaign/planning.js';
import {
  campaignIssue16,
  campaignPlanFixture,
  campaignRecordFixture,
  campaignStateFixture,
  futureIssue16,
} from './fixtures/campaign.js';

function issue15(overrides: Partial<CampaignIssueSnapshot> = {}): CampaignIssueSnapshot {
  return futureIssue16({ number: 15, readyForAgent: true, blockedBy: [], ...overrides });
}

function twoIssuePlan(overrides: Partial<CampaignPlanInput> = {}): CampaignPlanInput {
  return campaignPlanFixture({
    issueNumbers: [15, 16],
    issues: [issue15(), futureIssue16()],
    ...overrides,
  });
}

function twoIssueState(overrides = {}) {
  const plan = planCampaign(twoIssuePlan());
  if (!plan.ok) throw new Error(plan.failures.join('\n'));
  return campaignStateFixture({
    authorization: plan.authorization,
    issues: [
      { ...campaignIssue16({ issueNumber: 15, status: 'ready', blockersResolved: true }), status: 'ready', blockersResolved: true },
      campaignIssue16(),
    ],
    ...overrides,
  });
}

function completeAcceptedIssue(overrides = {}) {
  return campaignIssue16({
    status: 'active',
    blockersResolved: true,
    runId: 'run-16',
    verificationPassed: true,
    reviewRequired: true,
    reviewVerdict: 'SHIP',
    integrationCommit: 'abc123',
    integrationCommitCount: 1,
    integrationCommitOwner: 'coordinator',
    integrationCommitLocation: 'authorized-remote-target',
    targetIdentityRevalidated: true,
    revalidatedTargetRemote: 'git@github.com:DYEWolf/agent-orchestration-kit.git',
    revalidatedTargetBranch: 'main',
    containedInRemoteTarget: true,
    ...overrides,
  });
}

function withoutIssueField<K extends keyof ReconstructedCampaignIssue>(
  issue: ReconstructedCampaignIssue,
  key: K,
): ReconstructedCampaignIssue {
  const copy = { ...issue };
  delete copy[key];
  return copy;
}

describe('Campaign planning', () => {
  it('models the read-only live #16 future-member dogfood with fixed membership and no effects', () => {
    const result = planCampaign(campaignPlanFixture());
    expect(result).toMatchObject({ ok: true, effects: [] });
    if (!result.ok) return;
    expect(result.authorization.issueNumbers).toEqual([16]);
    expect(result.authorization.anchorIssue).toBe(14);
    expect(result.frontier).toEqual([{ issueNumber: 16, position: 0, eligibility: 'future' }]);
    expect(result.authorization.preauthorizedMutations).toEqual([]);
    expect(result.relevantOptionalPermissions).toEqual([
      'push-integration-commits',
      'create-update-branches',
      'create-update-merge-pull-requests',
    ]);
  });

  it('allows a complete blocked future Issue without ready-for-agent but requires the label once unblocked', () => {
    expect(planCampaign(campaignPlanFixture())).toMatchObject({ ok: true, effects: [] });
    const unblocked = planCampaign(campaignPlanFixture({
      issues: [futureIssue16({ blockedBy: [], readyForAgent: false })],
    }));
    expect(unblocked).toMatchObject({ ok: false, effects: [] });
    if (!unblocked.ok) expect(unblocked.failures.join('\n')).toContain('unblocked but lacks ready-for-agent');
  });

  it.each([
    ['objective', { objectiveComplete: false }],
    ['acceptance', { acceptanceComplete: false }],
    ['constraints', { constraintsComplete: false }],
    ['risks/review', { risksReviewComplete: false }],
    ['verification', { verificationComplete: false }],
  ])('rejects independently incomplete %s contract areas atomically', (area, change) => {
    const result = planCampaign(campaignPlanFixture({ issues: [futureIssue16(change)] }));
    expect(result).toMatchObject({ ok: false, effects: [] });
    if (!result.ok) expect(result.failures.join('\n')).toContain(`${area} contract is incomplete`);
  });

  it('rejects an incoherent fixed dependency order while allowing an external open blocker', () => {
    const incoherent = planCampaign(twoIssuePlan({ issueNumbers: [16, 15] }));
    expect(incoherent).toMatchObject({ ok: false, effects: [] });
    if (!incoherent.ok) expect(incoherent.failures.join('\n')).toContain('appears before its fixed Campaign blocker #15');
    expect(planCampaign(campaignPlanFixture())).toMatchObject({ ok: true, effects: [] });
  });

  it('selects a common umbrella or first member by default and accepts only relevant explicit anchors', () => {
    const noAnchorFacts = campaignPlanFixture();
    const { anchorFacts: _anchorFacts, ...withoutAnchorFacts } = noAnchorFacts;
    const noParent = futureIssue16();
    const { parentIssue: _parentIssue, ...withoutParent } = noParent;
    const firstMember = planCampaign({ ...withoutAnchorFacts, issues: [withoutParent] });
    expect(firstMember).toMatchObject({ ok: true });
    if (firstMember.ok) expect(firstMember.authorization.anchorIssue).toBe(16);

    const alternate = planCampaign(campaignPlanFixture({
      anchorIssue: 99,
      anchorFacts: { ...campaignPlanFixture().anchorFacts, relevantExistingAnchors: [99] },
    }));
    expect(alternate).toMatchObject({ ok: true });
    if (alternate.ok) expect(alternate.authorization.anchorIssue).toBe(99);

    const irrelevant = planCampaign(campaignPlanFixture({
      anchorIssue: 98,
      anchorFacts: { ...campaignPlanFixture().anchorFacts, relevantExistingAnchors: [99] },
    }));
    expect(irrelevant).toMatchObject({ ok: false, effects: [] });
  });

  it('distinguishes coordinator ownership, conflicting Campaign ownership, and resume-only Runs', () => {
    const coordinatorOwned = planCampaign(campaignPlanFixture({
      coordinator: 'coord',
      issues: [futureIssue16({ assignedTo: 'coord' })],
    }));
    expect(coordinatorOwned).toMatchObject({ ok: true });

    const anotherOwner = planCampaign(campaignPlanFixture({
      coordinator: 'coord',
      issues: [futureIssue16({ assignedTo: 'someone-else' })],
    }));
    expect(anotherOwner).toMatchObject({ ok: false, effects: [] });

    const activeOwner = planCampaign(campaignPlanFixture({
      issues: [futureIssue16({ campaignOwnership: { status: 'active', campaignId: 'other-campaign' } })],
    }));
    expect(activeOwner).toMatchObject({ ok: false, effects: [] });

    const existingRun = planCampaign(campaignPlanFixture({ issues: [futureIssue16({ executionRunId: 'run-16' })] }));
    expect(existingRun).toMatchObject({ ok: false, effects: [] });

    const resumed = planCampaign(campaignPlanFixture({
      mode: 'resume',
      resumeCampaignId: 'campaign-1',
      records: [campaignRecordFixture()],
      issues: [futureIssue16({ executionRunId: 'run-16', campaignOwnership: { status: 'active', campaignId: 'campaign-1' } })],
    }));
    expect(resumed).toMatchObject({ ok: true });

    const wrongMembership = planCampaign(campaignPlanFixture({
      mode: 'resume',
      resumeCampaignId: 'campaign-1',
      records: [campaignRecordFixture({
        authorization: { ...campaignRecordFixture().authorization, issueNumbers: [17] },
      })],
      issues: [futureIssue16({ executionRunId: 'run-16', campaignOwnership: { status: 'active', campaignId: 'campaign-1' } })],
    }));
    expect(wrongMembership).toMatchObject({ ok: false, effects: [] });
  });

  it('resumes from the exact immutable authorization while ignoring mutable resume inputs', () => {
    const record = campaignRecordFixture();
    const result = planCampaign(campaignPlanFixture({
      mode: 'resume',
      resumeCampaignId: 'campaign-1',
      records: [record],
      issues: [futureIssue16({
        executionRunId: 'run-16',
        campaignOwnership: { status: 'active', campaignId: 'campaign-1' },
      })],
      repository: {
        ...campaignPlanFixture().repository,
        baseBranch: 'rewritten-base',
        baseRevision: 'rewritten-revision',
        localMutations: ['rewritten-file'],
      },
      integrationRoute: 'direct-target-branch',
      requestedPreauthorizedMutations: ['trigger-rerun-remote-workflows'],
      inheritedInternalWorkerLimit: 99,
      createdAt: '2099-01-01T00:00:00.000Z',
    }));

    expect(result).toMatchObject({ ok: true, effects: [] });
    if (result.ok) {
      expect(result.authorization).toBe(record.authorization);
      expect(result.authorization).toEqual(record.authorization);
    }

    const changedTarget = planCampaign(campaignPlanFixture({
      mode: 'resume',
      resumeCampaignId: 'campaign-1',
      records: [record],
      issues: [futureIssue16({
        executionRunId: 'run-16',
        campaignOwnership: { status: 'active', campaignId: 'campaign-1' },
      })],
      repository: { ...campaignPlanFixture().repository, targetBranch: 'attacker-target' },
    }));
    expect(changedTarget).toMatchObject({ ok: false, effects: [] });
    if (!changedTarget.ok) expect(changedTarget.failures.join('\n')).toContain('remote target identity');
  });

  it('rejects an anonymous active record instead of accepting a different Issue owner on resume', () => {
    const parsedExternalRecord = {
      ...campaignRecordFixture(),
      campaignId: undefined,
    } as unknown as CampaignRecordSnapshot;
    const result = planCampaign(campaignPlanFixture({
      mode: 'resume',
      records: [parsedExternalRecord],
      issues: [futureIssue16({
        executionRunId: 'run-16',
        campaignOwnership: { status: 'active', campaignId: 'different-campaign' },
      })],
    }));

    expect(result).toMatchObject({ ok: false, effects: [] });
    if (!result.ok) expect(result.failures.join('\n')).toContain('stable Campaign identity');

    const inferredOwnerMismatch = planCampaign(campaignPlanFixture({
      mode: 'resume',
      records: [campaignRecordFixture()],
      issues: [futureIssue16({
        executionRunId: 'run-16',
        campaignOwnership: { status: 'paused', campaignId: 'different-campaign' },
      })],
    }));
    expect(inferredOwnerMismatch).toMatchObject({ ok: false, effects: [] });
    if (!inferredOwnerMismatch.ok) expect(inferredOwnerMismatch.failures.join('\n')).toContain('conflicting active Campaign ownership');
  });

  it('allows only a reconstructed accepted closed member during resume', () => {
    const record = campaignRecordFixture();
    const accepted = planCampaign(campaignPlanFixture({
      mode: 'resume',
      resumeCampaignId: 'campaign-1',
      records: [record],
      issues: [futureIssue16({
        state: 'closed',
        accepted: true,
        executionRunId: 'run-16',
        campaignOwnership: { status: 'active', campaignId: 'campaign-1' },
      })],
    }));
    expect(accepted).toMatchObject({ ok: true, effects: [] });
    if (accepted.ok) {
      expect(accepted.frontier).toEqual([{ issueNumber: 16, position: 0, eligibility: 'accepted' }]);
    }

    const ordinaryClosed = planCampaign(campaignPlanFixture({
      mode: 'resume',
      resumeCampaignId: 'campaign-1',
      records: [record],
      issues: [futureIssue16({
        state: 'closed',
        executionRunId: 'run-16',
        campaignOwnership: { status: 'active', campaignId: 'campaign-1' },
      })],
    }));
    expect(ordinaryClosed).toMatchObject({ ok: false, effects: [] });
    if (!ordinaryClosed.ok) expect(ordinaryClosed.failures.join('\n')).toContain('Issue #16 is not open');
  });

  it('exposes every relevant optional permission and rejects irrelevant requests', () => {
    const all = planCampaign(campaignPlanFixture({
      issues: [futureIssue16({ requiresRemoteWorkflow: true })],
      requestedPreauthorizedMutations: [
        'push-integration-commits',
        'create-update-branches',
        'create-update-merge-pull-requests',
        'trigger-rerun-remote-workflows',
      ],
    }));
    expect(all).toMatchObject({ ok: true });
    if (all.ok) expect(all.authorization.preauthorizedMutations).toEqual([
      'push-integration-commits',
      'create-update-branches',
      'create-update-merge-pull-requests',
      'trigger-rerun-remote-workflows',
    ]);

    const directPullRequest = planCampaign(campaignPlanFixture({
      integrationRoute: 'direct-target-branch',
      requestedPreauthorizedMutations: ['create-update-merge-pull-requests'],
    }));
    expect(directPullRequest).toMatchObject({ ok: false, effects: [] });

    const unnecessaryWorkflow = planCampaign(campaignPlanFixture({
      requestedPreauthorizedMutations: ['trigger-rerun-remote-workflows'],
    }));
    expect(unnecessaryWorkflow).toMatchObject({ ok: false, effects: [] });

    const unnecessaryBranch = planCampaign(campaignPlanFixture({
      repository: { ...campaignPlanFixture().repository, branchMutationsRequired: false },
      requestedPreauthorizedMutations: ['create-update-branches'],
    }));
    expect(unnecessaryBranch).toMatchObject({ ok: false, effects: [] });
  });
});

describe('Campaign lifecycle', () => {
  it('appends the immutable record and immediately executes after final authorization', () => {
    const result = advanceCampaign(campaignStateFixture({ status: 'proposed' }), { type: 'authorization-confirmed' });
    expect(result.state.status).toBe('active');
    expect(result.actions).toEqual([{ type: 'append-record-and-execute' }]);
  });

  it('emits readiness before starting a newly unblocked future member without using worker capacity as a cross-Issue gate', () => {
    const result = advanceCampaign(campaignStateFixture({ activeInternalWorkers: 3 }), { type: 'dependency-resolved', issueNumber: 16 });
    expect(result.state.activeIssueNumber).toBe(16);
    expect(result.state.issues[0]!.status).toBe('active');
    expect(result.actions).toEqual([
      { type: 'add-ready-for-agent', issueNumber: 16 },
      { type: 'start-issue', issueNumber: 16 },
    ]);
  });

  it('adds the readiness label even while another Issue remains active, then waits to preserve one active Issue', () => {
    const result = advanceCampaign(twoIssueState({ activeIssueNumber: 15, issues: [
      campaignIssue16({ issueNumber: 15, status: 'active', blockersResolved: true }),
      campaignIssue16(),
    ] }), { type: 'dependency-resolved', issueNumber: 16 });
    expect(result.state.issues[1]!.status).toBe('ready');
    expect(result.actions).toEqual([
      { type: 'add-ready-for-agent', issueNumber: 16 },
      { type: 'wait', reason: 'No independent authorized Campaign Issue is ready.' },
    ]);
  });

  it('dispatches Tasks only for the active Issue under the inherited internal worker limit', () => {
    const ready = campaignStateFixture({
      activeIssueNumber: 16,
      issues: [campaignIssue16({ status: 'active', blockersResolved: true })],
    });
    const dispatched = advanceCampaign(ready, { type: 'task-ready', issueNumber: 16, taskId: 'task-a' });
    expect(dispatched.state.activeInternalWorkers).toBe(1);
    expect(dispatched.actions).toEqual([{ type: 'dispatch-task', issueNumber: 16, taskId: 'task-a' }]);

    const full = advanceCampaign({ ...ready, activeInternalWorkers: 3 }, { type: 'task-ready', issueNumber: 16 });
    expect(full.actions).toEqual([{ type: 'wait', reason: 'Active internal Task concurrency limit reached.' }]);

    const other = advanceCampaign(twoIssueState({ activeIssueNumber: 15, issues: [
      campaignIssue16({ issueNumber: 15, status: 'active', blockersResolved: true }),
      campaignIssue16({ status: 'ready', blockersResolved: true }),
    ] }), { type: 'task-ready', issueNumber: 16 });
    expect(other.actions[0]).toEqual({ type: 'wait', reason: 'Task belongs to a non-active Campaign Issue.' });
  });

  it('distinguishes an Issue Pause from a Campaign Pause', () => {
    const issue = advanceCampaign(campaignStateFixture({ activeIssueNumber: 16, activeInternalWorkers: 2, issues: [campaignIssue16({ status: 'active', blockersResolved: true })] }), { type: 'issue-pause', issueNumber: 16, reason: 'awaiting design' });
    expect(issue.state.status).toBe('paused');
    expect(issue.state.activeIssueNumber).toBeUndefined();
    expect(issue.state.activeInternalWorkers).toBe(0);
    expect(issue.state.issues[0]!.status).toBe('issue-paused');
    expect(issue.actions).toEqual([
      { type: 'pause-issue', issueNumber: 16, reason: 'awaiting design' },
      { type: 'pause-campaign', reason: 'No independent authorized Campaign Issue is ready.' },
    ]);
    const campaign = advanceCampaign(campaignStateFixture({ activeIssueNumber: 16 }), { type: 'campaign-pause', reason: 'shared decision' });
    expect(campaign.state.status).toBe('paused');
    expect(campaign.state.activeIssueNumber).toBeUndefined();
  });

  it('checkpoints the active Issue and Task slots across Campaign Pause and resume', () => {
    const active = campaignStateFixture({
      activeIssueNumber: 16,
      activeInternalWorkers: 1,
      issues: [campaignIssue16({ status: 'active', blockersResolved: true })],
    });
    const paused = advanceCampaign(active, { type: 'campaign-pause', reason: 'shared decision' });
    expect(paused.state.status).toBe('paused');
    expect(paused.state.activeIssueNumber).toBe(16);
    expect(paused.state.activeInternalWorkers).toBe(1);

    const resumed = advanceCampaign(paused.state, { type: 'resume-requested' });
    expect(resumed.state.status).toBe('active');
    expect(resumed.state.activeIssueNumber).toBe(16);
    expect(resumed.state.activeInternalWorkers).toBe(1);
    const continued = advanceCampaign(resumed.state, { type: 'task-ready', issueNumber: 16, taskId: 'continued-task' });
    expect(continued.state.activeInternalWorkers).toBe(2);
    expect(continued.actions).toEqual([{ type: 'dispatch-task', issueNumber: 16, taskId: 'continued-task' }]);

    const slotReleased = advanceCampaign(resumed.state, { type: 'task-finished', issueNumber: 16, taskId: 'existing-task' });
    expect(slotReleased.state.activeInternalWorkers).toBe(0);
    const continuedAfterRelease = advanceCampaign(slotReleased.state, { type: 'task-ready', issueNumber: 16, taskId: 'continued-task' });
    expect(continuedAfterRelease.actions).toEqual([{ type: 'dispatch-task', issueNumber: 16, taskId: 'continued-task' }]);
  });

  it('keeps a Protected Mutation pause outstanding and confirms only its matching mutation', () => {
    const paused = advanceCampaign(campaignStateFixture(), { type: 'protected-mutation-requested', mutation: 'publish' });
    expect(paused.state.status).toBe('paused');
    expect(paused.state.pendingProtectedMutation).toBe('publish');
    expect(paused.actions).toEqual([{ type: 'request-immediate-confirmation', mutation: 'publish' }]);

    const wrong = advanceCampaign(paused.state, { type: 'protected-mutation-confirmed', mutation: 'destructive-external-action' });
    expect(wrong.state.status).toBe('paused');
    expect(wrong.state.pendingProtectedMutation).toBe('publish');

    const confirmed = advanceCampaign(paused.state, { type: 'protected-mutation-confirmed', mutation: 'publish' });
    expect(confirmed.state.status).toBe('active');
    expect(confirmed.state.pendingProtectedMutation).toBeUndefined();
    expect(confirmed.actions).toEqual([{ type: 'execute-protected-mutation', mutation: 'publish' }]);

    const cancelled = advanceCampaign(campaignStateFixture({ status: 'cancelled' }), { type: 'protected-mutation-confirmed', mutation: 'publish' });
    expect(cancelled.state.status).toBe('cancelled');
    expect(cancelled.actions[0]).toMatchObject({ type: 'wait' });
    const completed = advanceCampaign(campaignStateFixture({ status: 'completed' }), { type: 'protected-mutation-confirmed', mutation: 'publish' });
    expect(completed.state.status).toBe('completed');
    expect(completed.actions[0]).toMatchObject({ type: 'wait' });
  });

  it('creates FIX_FIRST corrections in the existing Run and scopes RETHINK pauses correctly', () => {
    const state = campaignStateFixture({
      activeIssueNumber: 16,
      issues: [campaignIssue16({ status: 'active', blockersResolved: true, runId: 'run-16' })],
    });
    expect(advanceCampaign(state, { type: 'review-returned', issueNumber: 16, verdict: 'FIX_FIRST' }).actions)
      .toEqual([{ type: 'create-correction-in-same-run', issueNumber: 16, runId: 'run-16' }]);

    const local = advanceCampaign(state, { type: 'review-returned', issueNumber: 16, verdict: 'RETHINK', scope: 'issue-local' });
    expect(local.state.status).toBe('paused');
    expect(local.state.activeIssueNumber).toBeUndefined();
    expect(local.state.activeInternalWorkers).toBe(0);
    expect(local.state.issues[0]!.status).toBe('issue-paused');
    expect(local.actions).toEqual([
      { type: 'pause-issue', issueNumber: 16, reason: 'RETHINK requires an architectural or requirement decision.' },
      { type: 'pause-campaign', reason: 'No independent authorized Campaign Issue is ready.' },
    ]);

    const transversal = advanceCampaign(state, { type: 'review-returned', issueNumber: 16, verdict: 'RETHINK', scope: 'transversal' });
    expect(transversal.state.status).toBe('paused');
    expect(transversal.actions[0]).toEqual({ type: 'pause-campaign', reason: 'RETHINK requires an architectural or requirement decision.' });
  });

  it('cleans active slots and schedules the next member for issue-local RETHINK', () => {
    const state = twoIssueState({
      activeIssueNumber: 15,
      activeInternalWorkers: 2,
      issues: [
        campaignIssue16({ issueNumber: 15, status: 'active', blockersResolved: true }),
        campaignIssue16({ status: 'ready', blockersResolved: true }),
      ],
    });
    const paused = advanceCampaign(state, {
      type: 'review-returned',
      issueNumber: 15,
      verdict: 'RETHINK',
      scope: 'issue-local',
      reason: 'issue-only decision',
    });
    expect(paused.state.activeIssueNumber).toBe(16);
    expect(paused.state.activeInternalWorkers).toBe(0);
    expect(paused.state.issues[0]!.status).toBe('issue-paused');
    expect(paused.state.issues[1]!.status).toBe('active');
    expect(paused.actions).toEqual([
      { type: 'pause-issue', issueNumber: 15, reason: 'issue-only decision' },
      { type: 'start-issue', issueNumber: 16 },
    ]);
  });

  it('keeps the Campaign active and starts the next independent member after an explicit Issue Pause', () => {
    const state = twoIssueState({
      activeIssueNumber: 15,
      activeInternalWorkers: 2,
      issues: [
        campaignIssue16({ issueNumber: 15, status: 'active', blockersResolved: true }),
        campaignIssue16({ status: 'ready', blockersResolved: true }),
      ],
    });
    const paused = advanceCampaign(state, { type: 'issue-pause', issueNumber: 15, reason: 'issue-only gate' });
    expect(paused.state.status).toBe('active');
    expect(paused.state.activeIssueNumber).toBe(16);
    expect(paused.state.activeInternalWorkers).toBe(0);
    expect(paused.state.issues[0]!.status).toBe('issue-paused');
    expect(paused.state.issues[1]!.status).toBe('active');
    expect(paused.actions).toEqual([
      { type: 'pause-issue', issueNumber: 15, reason: 'issue-only gate' },
      { type: 'start-issue', issueNumber: 16 },
    ]);
  });

  it('requires the exact active Issue, its existing Run, and settled internal slots before acceptance', () => {
    const complete = completeAcceptedIssue();
    const nonActive = advanceCampaign(campaignStateFixture({
      activeIssueNumber: undefined,
      issues: [{ ...complete, status: 'ready' }],
    }), { type: 'acceptance-checked', issueNumber: 16 });
    expect(nonActive.state.issues[0]!.status).toBe('ready');
    expect(nonActive.actions[0]).toMatchObject({ type: 'keep-issue-open' });
    expect(nonActive.actions[0]!.type === 'keep-issue-open' ? nonActive.actions[0].reason : '').toContain('active Campaign Issue');

    const noRun = advanceCampaign(campaignStateFixture({
      activeIssueNumber: 16,
      issues: [withoutIssueField(complete, 'runId')],
    }), { type: 'acceptance-checked', issueNumber: 16 });
    expect(noRun.state.issues[0]!.status).toBe('active');
    expect(noRun.actions[0]).toMatchObject({ type: 'keep-issue-open' });
    expect(noRun.actions[0]!.type === 'keep-issue-open' ? noRun.actions[0].reason : '').toContain('existing Issue-owned Run');

    const activeSlots = advanceCampaign(campaignStateFixture({
      activeIssueNumber: 16,
      activeInternalWorkers: 1,
      issues: [complete],
    }), { type: 'acceptance-checked', issueNumber: 16 });
    expect(activeSlots.state).toEqual(campaignStateFixture({
      activeIssueNumber: 16,
      activeInternalWorkers: 1,
      issues: [complete],
    }));
    expect(activeSlots.actions[0]).toMatchObject({ type: 'keep-issue-open' });
    expect(activeSlots.actions[0]!.type === 'keep-issue-open' ? activeSlots.actions[0].reason : '').toContain('active internal Task slots');
  });

  it('does not accept a non-active member or mutate the other active Issue on an acceptance gap', () => {
    const state = twoIssueState({
      activeIssueNumber: 15,
      activeInternalWorkers: 1,
      issues: [
        campaignIssue16({ issueNumber: 15, status: 'active', blockersResolved: true, runId: 'run-15' }),
        completeAcceptedIssue({ status: 'ready' }),
      ],
    });
    const result = advanceCampaign(state, { type: 'acceptance-checked', issueNumber: 16 });
    expect(result.state).toEqual(state);
    expect(result.actions[0]).toMatchObject({ type: 'keep-issue-open', issueNumber: 16 });
  });

  it('requires explicit Issue Pause resolution and reuses the existing Run', () => {
    const active = campaignStateFixture({
      activeIssueNumber: 16,
      issues: [campaignIssue16({ status: 'active', blockersResolved: true, runId: 'run-16' })],
    });
    const paused = advanceCampaign(active, { type: 'issue-pause', issueNumber: 16, reason: 'awaiting design' });
    const genericResume = advanceCampaign(paused.state, { type: 'resume-requested' });
    expect(genericResume.state).toEqual(paused.state);
    expect(genericResume.actions[0]).toMatchObject({ type: 'wait' });

    const resolved = advanceCampaign(paused.state, { type: 'issue-pause-resolved', issueNumber: 16 });
    expect(resolved.state.status).toBe('active');
    expect(resolved.state.activeIssueNumber).toBe(16);
    expect(resolved.state.issues[0]).toMatchObject({ status: 'active', runId: 'run-16' });
    expect(resolved.actions).toEqual([
      { type: 'resolve-issue-pause', issueNumber: 16, runId: 'run-16' },
      { type: 'start-issue', issueNumber: 16 },
    ]);
  });

  it('resolves a paused member while another Issue is active without violating one-active', () => {
    const state = twoIssueState({
      activeIssueNumber: 15,
      issues: [
        campaignIssue16({ issueNumber: 15, status: 'active', blockersResolved: true, runId: 'run-15' }),
        campaignIssue16({ status: 'issue-paused', blockersResolved: true, runId: 'run-16' }),
      ],
    });
    const resolved = advanceCampaign(state, { type: 'issue-pause-resolved', issueNumber: 16 });
    expect(resolved.state.status).toBe('active');
    expect(resolved.state.activeIssueNumber).toBe(15);
    expect(resolved.state.issues[1]).toMatchObject({ status: 'ready', runId: 'run-16' });
    expect(resolved.actions).toEqual([
      { type: 'resolve-issue-pause', issueNumber: 16, runId: 'run-16' },
      { type: 'wait', reason: 'No independent authorized Campaign Issue is ready.' },
    ]);
  });

  it('rejects Issue Pause resolution without a Run or across unrelated Campaign Pauses', () => {
    const noRun = campaignStateFixture({
      status: 'paused',
      pauseReason: 'No independent authorized Campaign Issue is ready.',
      issues: [campaignIssue16({ status: 'issue-paused', blockersResolved: true })],
    });
    const missingRun = advanceCampaign(noRun, { type: 'issue-pause-resolved', issueNumber: 16 });
    expect(missingRun.state).toEqual(noRun);
    expect(missingRun.actions[0]).toMatchObject({ type: 'wait' });

    for (const pause of [
      { pauseReason: 'RETHINK requires an architectural or requirement decision.' },
      { pendingProtectedMutation: 'publish' as const, pauseReason: 'Awaiting confirmation for publish.' },
      { pauseReason: 'unrelated pause' },
    ]) {
      const paused = campaignStateFixture({
        status: 'paused',
        ...pause,
        issues: [campaignIssue16({ status: 'issue-paused', blockersResolved: true, runId: 'run-16' })],
      });
      const result = advanceCampaign(paused, { type: 'issue-pause-resolved', issueNumber: 16 });
      expect(result.state).toEqual(paused);
      expect(result.actions[0]).toMatchObject({ type: 'wait' });
    }
  });

  it('investigates failures and pauses the Issue on the third same-context failure', () => {
    const first = advanceCampaign(campaignStateFixture({ activeIssueNumber: 16, activeInternalWorkers: 1, issues: [campaignIssue16({ status: 'active', blockersResolved: true })] }), { type: 'worker-failed', issueNumber: 16, context: 'test' });
    expect(first.actions[0]).toMatchObject({ type: 'investigate-failure' });
    const thirdState = campaignStateFixture({
      activeIssueNumber: 16,
      activeInternalWorkers: 1,
      issues: [campaignIssue16({ status: 'active', blockersResolved: true, sameContextFailures: 2, lastFailureContext: 'test' })],
    });
    const third = advanceCampaign(thirdState, { type: 'worker-failed', issueNumber: 16, context: 'test' });
    expect(third.state.status).toBe('paused');
    expect(third.state.activeIssueNumber).toBeUndefined();
    expect(third.state.activeInternalWorkers).toBe(0);
    expect(third.actions).toEqual([
      { type: 'pause-issue', issueNumber: 16, reason: 'Three same-context failures require a decision.' },
      { type: 'pause-campaign', reason: 'No independent authorized Campaign Issue is ready.' },
    ]);
  });

  it('cleans all active slots and schedules the next member on the third same-context failure', () => {
    const state = twoIssueState({
      activeIssueNumber: 15,
      activeInternalWorkers: 2,
      issues: [
        campaignIssue16({
          issueNumber: 15,
          status: 'active',
          blockersResolved: true,
          sameContextFailures: 2,
          lastFailureContext: 'test',
        }),
        campaignIssue16({ status: 'ready', blockersResolved: true }),
      ],
    });
    const paused = advanceCampaign(state, { type: 'worker-failed', issueNumber: 15, context: 'test' });
    expect(paused.state.activeIssueNumber).toBe(16);
    expect(paused.state.activeInternalWorkers).toBe(0);
    expect(paused.state.issues[0]!.status).toBe('issue-paused');
    expect(paused.state.issues[1]!.status).toBe('active');
    expect(paused.actions).toEqual([
      { type: 'pause-issue', issueNumber: 15, reason: 'Three same-context failures require a decision.' },
      { type: 'start-issue', issueNumber: 16 },
    ]);
  });

  it('resumes by reusing the immutable record and existing Run, but never revives completed or recordless state', () => {
    const paused = campaignStateFixture({
      status: 'paused',
      activeIssueNumber: undefined,
      issues: [campaignIssue16({ status: 'active', blockersResolved: true, runId: 'run-16' })],
    });
    const resumed = advanceCampaign(paused, { type: 'resume-requested' });
    expect(resumed.state.status).toBe('active');
    expect(resumed.actions[0]).toEqual({ type: 'reuse-record-and-reconstruct' });
    expect(resumed.actions.some((action) => action.type === 'create-correction-in-same-run')).toBe(false);

    const recordless = advanceCampaign({ ...paused, immutableRecordPresent: false }, { type: 'resume-requested' });
    expect(recordless.state.status).toBe('paused');
    expect(recordless.actions[0]).toMatchObject({ type: 'wait' });

    const completed = advanceCampaign({ ...paused, status: 'completed' }, { type: 'resume-requested' });
    expect(completed.state.status).toBe('completed');
    expect(completed.actions[0]).toMatchObject({ type: 'wait' });
  });

  it('cancels every unaccepted member observably, cleans Campaign resources, unassigns, and never rolls back accepted evidence', () => {
    const accepted = completeAcceptedIssue({ issueNumber: 15, status: 'accepted', assignedTo: 'coord' });
    const state = twoIssueState({
      activeIssueNumber: 16,
      activeInternalWorkers: 2,
      issues: [accepted, campaignIssue16({ status: 'active', blockersResolved: true, assignedTo: 'coord', terminalId: 'term-16', worktreePath: '/tmp/campaign-16' })],
    });
    const cancelled = advanceCampaign(state, { type: 'cancel-requested' });
    expect(cancelled.state.status).toBe('cancelled');
    expect(cancelled.state.activeIssueNumber).toBeUndefined();
    expect(cancelled.state.activeInternalWorkers).toBe(0);
    expect(cancelled.state.issues[0]).toEqual(accepted);
    expect(cancelled.state.issues[1]!.status).toBe('cancelled');
    expect(cancelled.state.issues[1]!.assignedTo).toBeUndefined();
    expect(cancelled.state.issues[1]!.terminalId).toBeUndefined();
    expect(cancelled.state.issues[1]!.worktreePath).toBeUndefined();
    expect(cancelled.state.cancellationEvidenceRecorded).toBe(true);
    expect(cancelled.state.rollbackPerformed).toBe(false);
    expect(cancelled.state.releasedTerminalIds).toEqual(['term-16']);
    expect(cancelled.state.releasedWorktreePaths).toEqual(['/tmp/campaign-16']);
    expect(cancelled.actions).toEqual([
      { type: 'stop-new-work' },
      { type: 'release-campaign-owned-resources', issueNumber: 16, terminalId: 'term-16', worktreePath: '/tmp/campaign-16' },
      { type: 'unassign-issue', issueNumber: 16 },
      { type: 'record-cancellation-evidence', issueNumber: 16 },
    ]);
    expect(advanceCampaign(cancelled.state, { type: 'task-ready', issueNumber: 16 }).actions[0]).toMatchObject({ type: 'wait' });
  });

  it('requires complete verification, required SHIP review, coordinator integration, revalidated identity, and remote containment', () => {
    const base = campaignStateFixture({ activeIssueNumber: 16, issues: [completeAcceptedIssue()] });
    const cases: readonly [string, Partial<ReturnType<typeof campaignIssue16>>][] = [
      ['verification', { verificationPassed: false }],
      ['required SHIP review', { reviewVerdict: 'FIX_FIRST' }],
      ['exactly one coordinator-owned integration commit', { integrationCommitCount: 2 }],
      ['exactly one coordinator-owned integration commit', { integrationCommitOwner: 'worker' }],
      ['trustworthy revalidated target identity', { targetIdentityRevalidated: false }],
      ['trustworthy revalidated target identity', { revalidatedTargetBranch: 'temporary' }],
      ['remote target commit rather than local-only or temporary branch', { integrationCommitLocation: 'local-only' }],
      ['containment in the authorized remote target branch', { containedInRemoteTarget: false }],
    ];
    for (const [gap, change] of cases) {
      const result = advanceCampaign({ ...base, issues: [completeAcceptedIssue(change)] }, { type: 'acceptance-checked', issueNumber: 16 });
      expect(result.state.issues[0]!.status).toBe('active');
      expect(result.actions[0]).toMatchObject({ type: 'keep-issue-open' });
      expect(result.actions[0]!.type === 'keep-issue-open' ? result.actions[0].reason : '').toContain(gap);
    }

    const missingEvidence: readonly [string, ReconstructedCampaignIssue][] = [
      ['exactly one coordinator-owned integration commit', withoutIssueField(completeAcceptedIssue(), 'integrationCommitCount')],
      ['exactly one coordinator-owned integration commit', withoutIssueField(completeAcceptedIssue(), 'integrationCommitOwner')],
      ['trustworthy revalidated target identity', withoutIssueField(completeAcceptedIssue(), 'revalidatedTargetRemote')],
      ['trustworthy revalidated target identity', withoutIssueField(completeAcceptedIssue(), 'revalidatedTargetBranch')],
      ['remote target commit rather than local-only or temporary branch', withoutIssueField(completeAcceptedIssue(), 'integrationCommitLocation')],
    ];
    for (const [gap, issue] of missingEvidence) {
      const result = advanceCampaign({ ...base, issues: [issue] }, { type: 'acceptance-checked', issueNumber: 16 });
      expect(result.actions[0]).toMatchObject({ type: 'keep-issue-open' });
      expect(result.actions[0]!.type === 'keep-issue-open' ? result.actions[0].reason : '').toContain(gap);
    }

    const accepted = advanceCampaign(base, { type: 'acceptance-checked', issueNumber: 16 });
    expect(accepted.state.status).toBe('completed');
    expect(accepted.state.issues[0]!.status).toBe('accepted');
    expect(accepted.actions).toEqual([{ type: 'record-acceptance', issueNumber: 16 }]);
  });
});
