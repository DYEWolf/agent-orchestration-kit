import {
  planCampaign,
  type CampaignIssueSnapshot,
  type CampaignPlanInput,
  type CampaignRecordSnapshot,
} from '../../src/campaign/planning.js';
import type { ReconstructedCampaignIssue, ReconstructedCampaignState } from '../../src/campaign/lifecycle.js';

export function futureIssue16(overrides: Partial<CampaignIssueSnapshot> = {}): CampaignIssueSnapshot {
  return {
    number: 16,
    state: 'open',
    approved: true,
    // The live future member is blocked by #15 and consequently has no label.
    readyForAgent: false,
    objectiveComplete: true,
    acceptanceComplete: true,
    constraintsComplete: true,
    risksReviewComplete: true,
    verificationComplete: true,
    blockedBy: [15],
    parentIssue: 14,
    ...overrides,
  };
}

export function campaignPlanFixture(overrides: Partial<CampaignPlanInput> = {}): CampaignPlanInput {
  return {
    // This is a read-only dogfood of the live future-member shape: #15 is an
    // external blocker and is deliberately not Campaign membership.
    issueNumbers: [16],
    issues: [futureIssue16()],
    records: [],
    repository: {
      remote: 'git@github.com:DYEWolf/agent-orchestration-kit.git',
      targetBranch: 'main',
      baseBranch: 'main',
      baseRevision: 'abc123',
      localMutations: ['CONTEXT.md'],
    },
    anchorFacts: {
      commonUmbrellaIssue: 14,
      relevantExistingAnchors: [14],
    },
    integrationRoute: 'pull-request',
    requestedPreauthorizedMutations: [],
    inheritedInternalWorkerLimit: 3,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

export function campaignRecordFixture(overrides: Partial<CampaignRecordSnapshot> = {}): CampaignRecordSnapshot {
  const result = planCampaign(campaignPlanFixture());
  if (!result.ok) throw new Error(result.failures.join('\n'));
  return {
    authorization: result.authorization,
    status: 'active',
    campaignId: 'campaign-1',
    markerPresent: true,
    ...overrides,
  };
}

export function campaignIssue16(overrides: Partial<ReconstructedCampaignIssue> = {}): ReconstructedCampaignIssue {
  return {
    issueNumber: 16,
    status: 'future',
    blockersResolved: false,
    sameContextFailures: 0,
    verificationPassed: false,
    reviewRequired: true,
    containedInRemoteTarget: false,
    ...overrides,
  };
}

export function campaignStateFixture(overrides: Partial<ReconstructedCampaignState> = {}): ReconstructedCampaignState {
  const plan = campaignPlanFixture();
  const result = planCampaign(plan);
  if (!result.ok) throw new Error(result.failures.join('\n'));
  return {
    authorization: result.authorization,
    status: 'active',
    issues: [campaignIssue16()],
    activeInternalWorkers: 0,
    immutableRecordPresent: true,
    rollbackPerformed: false,
    ...overrides,
  };
}
