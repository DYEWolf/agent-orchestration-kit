import type { ProfileName } from '../config/schema.js';
import type { GitHubRepositoryIdentity } from '../repository/inspection.js';
import type { OrcaAction } from '../adapters/orca/orca.js';
import type { READY_FOR_AGENT_LABEL } from '../adapters/github/github.js';

export type PlannedFileAction = 'create' | 'update' | 'unchanged';

export interface PlannedFileChange {
  readonly path: string;
  readonly action: PlannedFileAction;
  readonly ownership: 'full' | 'managed-block';
  readonly desiredHash: string;
  readonly reason: string;
}

export interface PlanBlocker {
  readonly code:
    | 'collision'
    | 'drift'
    | 'foreign-version'
    | 'github-prerequisite'
    | 'invalid-manifest'
    | 'malformed-managed-block'
    | 'unsafe-path';
  readonly path: string;
  readonly message: string;
}

export interface PlannedExternalAction {
  readonly id: OrcaAction['id'];
  readonly target: string;
  readonly argv: readonly string[];
  readonly state: 'planned' | 'already-satisfied' | 'suppressed' | 'unavailable';
  readonly reason: string;
}

export interface PlannedGitHubLabelMutation {
  readonly id: 'create-ready-for-agent-label';
  readonly repositoryNodeId: string;
  readonly target: string;
  readonly name: typeof READY_FOR_AGENT_LABEL.name;
  readonly color: typeof READY_FOR_AGENT_LABEL.color;
  readonly description: typeof READY_FOR_AGENT_LABEL.description;
  readonly argv: readonly string[];
  readonly state: 'planned' | 'already-satisfied' | 'suppressed' | 'unavailable';
  readonly reason: string;
}

export interface ChangePlan {
  readonly schemaVersion: 1;
  readonly command: 'init';
  readonly repository: {
    readonly root: string;
    readonly github: GitHubRepositoryIdentity;
  };
  readonly profile: {
    readonly name: ProfileName;
    readonly stability: 'stable' | 'pending-live-validation';
  };
  readonly files: readonly PlannedFileChange[];
  readonly blockers: readonly PlanBlocker[];
  readonly globalCommands: readonly PlannedExternalAction[];
  readonly githubLabelMutations: readonly PlannedGitHubLabelMutation[];
  readonly validations: readonly string[];
  readonly rollbackActions: readonly string[];
  readonly summary: {
    readonly create: number;
    readonly update: number;
    readonly unchanged: number;
    readonly blocked: number;
  };
  readonly canApply: boolean;
  readonly phase: 'phase-4-orca-application';
}
