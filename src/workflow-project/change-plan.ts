import type { ProfileName } from '../config/schema.js';
import type { GitHubRepositoryIdentity } from '../repository/inspection.js';

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
    | 'invalid-manifest'
    | 'malformed-managed-block'
    | 'unsafe-path';
  readonly path: string;
  readonly message: string;
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
  readonly globalCommands: readonly [];
  readonly githubLabelMutations: readonly [];
  readonly validations: readonly string[];
  readonly rollbackActions: readonly string[];
  readonly summary: {
    readonly create: number;
    readonly update: number;
    readonly unchanged: number;
    readonly blocked: number;
  };
  readonly canApply: boolean;
  readonly phase: 'phase-2-local-application';
}
