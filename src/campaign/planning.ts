/** Internal, deterministic Campaign authorization planning seam. */

export const preauthorizedMutations = [
  'push-integration-commits',
  'create-update-branches',
  'create-update-merge-pull-requests',
  'trigger-rerun-remote-workflows',
] as const;

export type PreauthorizedMutation = (typeof preauthorizedMutations)[number];

export const protectedMutations = [
  'publish',
  'deploy-or-change-protected-environment',
  'change-secrets-or-credentials',
  'change-branch-or-environment-protection',
  'destructive-external-action',
  'change-global-machine-or-account-configuration',
] as const;

export type ProtectedMutation = (typeof protectedMutations)[number];

export interface CampaignAnchorFacts {
  /** An existing umbrella shared by all selected Issues, when one exists. */
  readonly commonUmbrellaIssue?: number;
  /** Existing Issues that are relevant places for a Campaign Record. */
  readonly relevantExistingAnchors?: readonly number[];
  /** Parent/umbrella observations keyed by selected Issue number. */
  readonly parentIssues?: Readonly<Record<number, number | undefined>>;
}

export interface CampaignOwnershipSnapshot {
  /** Stable identity is required whenever an Issue advertises Campaign ownership. */
  readonly campaignId: string;
  readonly status: 'active' | 'paused' | 'cancelled' | 'completed';
  readonly coordinator?: string;
}

export interface CampaignIssueSnapshot {
  readonly number: number;
  readonly state: 'open' | 'closed';
  readonly approved?: boolean;
  readonly readyForAgent?: boolean;
  /** Each contract area is deliberately independent at preflight. */
  readonly objectiveComplete?: boolean;
  readonly acceptanceComplete?: boolean;
  readonly constraintsComplete?: boolean;
  readonly risksReviewComplete?: boolean;
  readonly verificationComplete?: boolean;
  readonly blockedBy: readonly number[];
  readonly assignedTo?: string;
  readonly executionRunId?: string;
  readonly campaignOwnership?: CampaignOwnershipSnapshot;
  readonly parentIssue?: number;
  readonly requiresRemoteWorkflow?: boolean;
  readonly requiredPreauthorizedMutations?: readonly PreauthorizedMutation[];
  /** Resume may admit a closed Issue only when reconstruction proves it was accepted. */
  readonly accepted?: boolean;
}

export interface CampaignRecordSnapshot {
  /** The complete immutable authorization persisted by the Campaign Record. */
  readonly authorization: CampaignAuthorization;
  readonly status: 'active' | 'paused' | 'cancelled' | 'completed';
  /** Record identity is stable metadata used to bind a resume request. */
  readonly campaignId: string;
  /** Parsers may expose marker presence separately from the immutable payload. */
  readonly markerPresent?: boolean;
}

export interface CampaignAuthorization {
  readonly version: 1;
  readonly recordMarker: '<!-- orca-campaign-record:v1 -->';
  readonly anchorIssue: number;
  readonly issueNumbers: readonly number[];
  readonly repository: {
    readonly remote: string;
    readonly targetBranch: string;
  };
  readonly base: {
    readonly branch: string;
    readonly revision: string;
  };
  readonly localMutations: readonly string[];
  readonly preauthorizedMutations: readonly PreauthorizedMutation[];
  readonly protectedMutations: readonly ProtectedMutation[];
  readonly crossIssueConcurrency: 1;
  readonly inheritedInternalWorkerLimit: number;
  readonly integrationRoute: 'direct-target-branch' | 'pull-request';
  readonly pauseConditions: readonly string[];
  readonly stoppingCondition: string;
  readonly createdAt: string;
  readonly coordinator?: string;
}

export interface CampaignPlanInput {
  /** The user-supplied order. Planning never discovers or appends membership. */
  readonly issueNumbers: readonly number[];
  readonly issues: readonly CampaignIssueSnapshot[];
  readonly records: readonly CampaignRecordSnapshot[];
  readonly repository: {
    readonly remote?: string;
    readonly targetBranch?: string;
    readonly baseBranch?: string;
    readonly baseRevision?: string;
    readonly localMutations: readonly string[];
    /** Defaults to true because Campaign integration uses an authorized branch. */
    readonly branchMutationsRequired?: boolean;
    readonly remoteWorkflowsRequired?: boolean;
  };
  /** An explicit alternate anchor. It need not be a membership Issue. */
  readonly anchorIssue?: number;
  readonly anchorFacts?: CampaignAnchorFacts;
  readonly integrationRoute: 'direct-target-branch' | 'pull-request';
  readonly requestedPreauthorizedMutations: readonly PreauthorizedMutation[];
  readonly inheritedInternalWorkerLimit: number;
  readonly createdAt: string;
  readonly coordinator?: string;
  /** Start is the default; resume/reconstruction may reuse existing Runs. */
  readonly mode?: 'start' | 'resume';
  readonly resumeCampaignId?: string;
}

const campaignRecordMarker = '<!-- orca-campaign-record:v1 -->' as const;

export interface CampaignFrontierMember {
  readonly issueNumber: number;
  readonly position: number;
  readonly eligibility: 'ready' | 'future' | 'accepted';
}

export interface CampaignPlanFailure {
  readonly ok: false;
  readonly failures: readonly string[];
  /** Planning is a preflight: it never writes or creates runtime work. */
  readonly effects: readonly [];
}

export interface CampaignPlanSuccess {
  readonly ok: true;
  readonly effects: readonly [];
  readonly authorization: CampaignAuthorization;
  readonly frontier: readonly CampaignFrontierMember[];
  /** All optional permissions relevant to this selected Campaign. */
  readonly relevantOptionalPermissions: readonly PreauthorizedMutation[];
}

export type CampaignPlan = CampaignPlanFailure | CampaignPlanSuccess;

function unique<T>(items: readonly T[]): readonly T[] {
  return [...new Set(items)];
}

function isStableCampaignId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function issueRequiresRemoteWorkflow(issue: CampaignIssueSnapshot): boolean {
  return issue.requiresRemoteWorkflow === true
    || issue.requiredPreauthorizedMutations?.includes('trigger-rerun-remote-workflows') === true;
}

function relevantPermissions(input: CampaignPlanInput): readonly PreauthorizedMutation[] {
  const relevant: PreauthorizedMutation[] = [
    'push-integration-commits',
  ];
  const branchRequired = input.repository.branchMutationsRequired
    ?? input.integrationRoute === 'pull-request';
  if (branchRequired) relevant.push('create-update-branches');
  if (input.integrationRoute === 'pull-request') {
    relevant.push('create-update-merge-pull-requests');
  }
  const workflowRequired = input.repository.remoteWorkflowsRequired === true
    || input.issues.some((issue) => input.issueNumbers.includes(issue.number) && issueRequiresRemoteWorkflow(issue));
  if (workflowRequired) relevant.push('trigger-rerun-remote-workflows');
  return unique(relevant);
}

function parentIssueFor(input: CampaignPlanInput, issue: CampaignIssueSnapshot): number | undefined {
  return issue.parentIssue
    ?? input.anchorFacts?.parentIssues?.[issue.number];
}

function resolveAnchor(input: CampaignPlanInput, issueNumbers: readonly number[]): {
  readonly anchor?: number | undefined;
  readonly relevantAnchors: readonly number[];
  readonly commonUmbrella?: number | undefined;
} {
  const parentAnchors = input.issues
    .filter((issue) => issueNumbers.includes(issue.number))
    .map((issue) => parentIssueFor(input, issue))
    .filter((issue): issue is number => issue !== undefined);
  const commonUmbrella = input.anchorFacts?.commonUmbrellaIssue
    ?? (unique(parentAnchors).length === 1 ? parentAnchors[0] : undefined);
  const relevantAnchors = unique([
    ...(input.anchorFacts?.relevantExistingAnchors ?? []),
    ...(commonUmbrella === undefined ? [] : [commonUmbrella]),
    ...parentAnchors,
  ]);
  return {
    anchor: input.anchorIssue ?? commonUmbrella ?? issueNumbers[0],
    relevantAnchors,
    commonUmbrella,
  };
}

function isResume(input: CampaignPlanInput): boolean {
  return input.mode === 'resume';
}

/**
 * Produce a proposal only. Adapters are responsible for asking permissions,
 * appending the record comment, and starting Orca work after authorization.
 */
export function planCampaign(input: CampaignPlanInput): CampaignPlan {
  const failures: string[] = [];
  const issueNumbers = [...input.issueNumbers];
  const distinctIssueNumbers = unique(issueNumbers);
  const resume = isResume(input);
  const activeRecords = input.records.filter((record) => (
    record.authorization.recordMarker === campaignRecordMarker
      && record.markerPresent !== false
      && (record.status === 'active' || record.status === 'paused')
  ));
  const resumedRecord = activeRecords.length === 1 ? activeRecords[0] : undefined;
  const recordedCampaignId = resumedRecord?.campaignId;

  if (issueNumbers.length === 0) failures.push('Campaign membership must be a non-empty explicit Issue list.');
  if (distinctIssueNumbers.length !== issueNumbers.length) failures.push('Campaign membership contains a duplicate Issue.');
  if (!input.repository.remote) failures.push('Repository remote identity is required.');
  if (!input.repository.targetBranch) failures.push('Authorized remote target branch is required.');
  if (!input.repository.baseBranch || !input.repository.baseRevision) failures.push('Base branch and revision are required.');
  if (!Number.isInteger(input.inheritedInternalWorkerLimit) || input.inheritedInternalWorkerLimit < 1) {
    failures.push('Inherited internal worker limit must be at least one.');
  }

  const issues = new Map(input.issues.map((issue) => [issue.number, issue]));
  const membershipPosition = new Map(issueNumbers.map((number, position) => [number, position]));
  for (const number of issueNumbers) {
    const issue = issues.get(number);
    if (!issue) {
      failures.push(`Issue #${number} is missing from the preflight snapshot.`);
      continue;
    }
    const acceptedOnResume = resume && issue.accepted === true;
    if (!acceptedOnResume && issue.state !== 'open') failures.push(`Issue #${number} is not open.`);
    if (issue.approved !== true) failures.push(`Issue #${number} is not approved.`);

    const completeness: readonly [string, boolean | undefined][] = [
      ['objective', issue.objectiveComplete],
      ['acceptance', issue.acceptanceComplete],
      ['constraints', issue.constraintsComplete],
      ['risks/review', issue.risksReviewComplete],
      ['verification', issue.verificationComplete],
    ];
    for (const [area, complete] of completeness) {
      if (complete !== true) failures.push(`Issue #${number} ${area} contract is incomplete.`);
    }

    const blocked = issue.blockedBy.length > 0;
    if (!acceptedOnResume && !blocked && issue.readyForAgent !== true) {
      failures.push(`Issue #${number} is unblocked but lacks ready-for-agent.`);
    }

    for (const blocker of issue.blockedBy) {
      const blockerPosition = membershipPosition.get(blocker);
      if (blocker === number) {
        failures.push(`Issue #${number} has an incoherent self-dependency.`);
      } else if (blockerPosition !== undefined && blockerPosition > (membershipPosition.get(number) ?? -1)) {
        failures.push(`Issue #${number} appears before its fixed Campaign blocker #${blocker}.`);
      }
    }

    const coordinator = input.coordinator;
    if (issue.assignedTo && (!coordinator || issue.assignedTo !== coordinator)) {
      failures.push(`Issue #${number} is assigned to another owner.`);
    }

    const ownership = issue.campaignOwnership;
    const activeOwnership = ownership?.status === 'active' || ownership?.status === 'paused';
    if (activeOwnership && !isStableCampaignId(ownership?.campaignId)) {
      failures.push(`Issue #${number} active Campaign ownership requires a stable Campaign identity.`);
    }
    const sameResumedCampaign = resume
      && activeOwnership
      && isStableCampaignId(recordedCampaignId)
      && ownership?.campaignId === recordedCampaignId;
    if (activeOwnership && !sameResumedCampaign) {
      failures.push(`Issue #${number} has conflicting active Campaign ownership.`);
    }
    if (issue.executionRunId && !resume) {
      failures.push(`Issue #${number} already has an Issue-owned Run; new starts cannot reuse it.`);
    }
  }

  const anchor = resolveAnchor(input, issueNumbers);
  if (input.anchorIssue !== undefined && !anchor.relevantAnchors.includes(input.anchorIssue)) {
    failures.push('Explicit alternate anchor must be one of the provided relevant existing anchors.');
  }
  if (anchor.anchor === undefined) failures.push('Campaign anchor Issue could not be selected.');

  if (activeRecords.length > 0 && !resume) {
    failures.push('An active or paused Campaign Record already exists.');
  }
  if (resume && activeRecords.length !== 1) {
    failures.push('Resume/reconstruction requires exactly one existing immutable Campaign Record.');
  }
  for (const record of activeRecords) {
    if (!isStableCampaignId(record.campaignId)) {
      failures.push('Every active or paused Campaign Record requires a stable Campaign identity.');
    }
  }
  if (resume && activeRecords.length === 1) {
    const record = activeRecords[0]!;
    if (input.resumeCampaignId !== undefined && record.campaignId !== input.resumeCampaignId) {
      failures.push('Resume Campaign identity does not match the immutable Campaign Record.');
    }
    const recordedAuthorization = record.authorization;
    if (recordedAuthorization.repository.remote !== input.repository.remote
      || recordedAuthorization.repository.targetBranch !== input.repository.targetBranch) {
      failures.push('Resume remote target identity does not match the immutable Campaign Record.');
    }
    if (recordedAuthorization.anchorIssue !== anchor.anchor) {
      failures.push('Resume anchor does not match the immutable Campaign Record.');
    }
    if (recordedAuthorization.issueNumbers.length !== issueNumbers.length
      || recordedAuthorization.issueNumbers.some((number, position) => number !== issueNumbers[position])) {
      failures.push('Resume membership and order do not match the immutable Campaign Record.');
    }
    if (recordedAuthorization.coordinator !== input.coordinator) {
      failures.push('Resume coordinator does not match the immutable Campaign Record.');
    }
  }

  const requested = input.requestedPreauthorizedMutations;
  const relevant = resume && activeRecords.length === 1
    ? activeRecords[0]!.authorization.preauthorizedMutations
    : relevantPermissions(input);
  if (!resume) {
    if (new Set(requested).size !== requested.length) {
      failures.push('Requested preauthorized mutations must not contain duplicates.');
    }
    if (requested.some((permission) => !relevant.includes(permission))) {
      failures.push('A requested preauthorized mutation is not relevant to the selected Issues and integration route.');
    }
  }

  if (failures.length > 0) return { ok: false, failures, effects: [] };

  const frontier = issueNumbers.map((number, position) => {
    const issue = issues.get(number)!;
    const acceptedOnResume = resume && issue.accepted === true;
    return {
      issueNumber: number,
      position,
      eligibility: acceptedOnResume
        ? 'accepted'
        : issue.blockedBy.length === 0 ? 'ready' : 'future',
    } as const;
  });

  const resumedAuthorization = resume && activeRecords.length === 1
    ? activeRecords[0]!.authorization
    : undefined;
  const coordinator = input.coordinator;
  return {
    ok: true,
    effects: [],
    relevantOptionalPermissions: relevant,
    frontier,
    authorization: resumedAuthorization ?? {
      version: 1,
      recordMarker: campaignRecordMarker,
      anchorIssue: anchor.anchor!,
      issueNumbers,
      repository: { remote: input.repository.remote!, targetBranch: input.repository.targetBranch! },
      base: { branch: input.repository.baseBranch!, revision: input.repository.baseRevision! },
      localMutations: [...input.repository.localMutations],
      preauthorizedMutations: requested,
      protectedMutations,
      crossIssueConcurrency: 1,
      inheritedInternalWorkerLimit: input.inheritedInternalWorkerLimit,
      integrationRoute: input.integrationRoute,
      pauseConditions: [
        'Protected Mutation requires immediate confirmation of the pending mutation.',
        'Three same-context failures pause the affected Campaign Issue.',
        'Issue-local RETHINK pauses one Issue; transversal RETHINK pauses the Campaign.',
      ],
      stoppingCondition: 'Stop when every fixed member is accepted, the Campaign is cancelled, or a Campaign Pause requires a decision.',
      createdAt: input.createdAt,
      ...(coordinator === undefined ? {} : { coordinator }),
    },
  };
}
