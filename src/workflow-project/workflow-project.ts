import type { FileSystemAdapter } from '../adapters/filesystem/filesystem.js';
import { NodeFileSystem } from '../adapters/filesystem/node-filesystem.js';
import { inspectManagedBlock } from '../artifacts/managed-block.js';
import { renderDesiredArtifacts, type DesiredArtifact } from '../artifacts/render.js';
import { profiles, resolveConfig } from '../config/profiles.js';
import type { ProfileName } from '../config/schema.js';
import {
  inspectRepository,
  type RepositoryInspection,
} from '../repository/inspection.js';
import { sha256 } from '../shared/hash.js';
import { PathShapeError, resolveSafeTarget, UnsafePathError } from '../shared/path.js';
import { CLI_VERSION } from '../version.js';
import type { ChangePlan, PlanBlocker, PlannedFileChange } from './change-plan.js';
import { computeDrift, type DriftReport } from './drift.js';
import { manifestSchema, type Manifest } from './manifest.js';

export interface InitWorkflowCommand {
  readonly type: 'init';
  readonly path: string;
  readonly profile: ProfileName;
}

export type WorkflowCommand = InitWorkflowCommand;

export interface ApplyReceipt {
  readonly applied: boolean;
  readonly reason: string;
}

export interface DoctorReport {
  readonly checks: readonly [];
  readonly phase: 'not-implemented';
}

export interface WorkflowProjectContract {
  plan(command: WorkflowCommand): Promise<ChangePlan>;
  apply(plan: ChangePlan): Promise<ApplyReceipt>;
  doctor(): Promise<DoctorReport>;
  diff(path: string): Promise<DriftReport>;
}

export interface WorkflowProjectDependencies {
  readonly filesystem?: FileSystemAdapter;
  readonly inspect?: (path: string) => Promise<RepositoryInspection>;
}

export class WorkflowProject implements WorkflowProjectContract {
  readonly #filesystem: FileSystemAdapter;
  readonly #inspect: (path: string) => Promise<RepositoryInspection>;

  public constructor(dependencies: WorkflowProjectDependencies = {}) {
    this.#filesystem = dependencies.filesystem ?? new NodeFileSystem();
    this.#inspect = dependencies.inspect ?? inspectRepository;
  }

  public async plan(command: WorkflowCommand): Promise<ChangePlan> {
    const repository = await this.#inspect(command.path);
    const config = resolveConfig(command.profile);
    const artifacts = renderDesiredArtifacts(config);
    const { manifest, manifestBlockers } = await this.readManifest(repository.root);
    const blockers: PlanBlocker[] = [...manifestBlockers];

    if (manifest !== undefined && manifest.cliVersion !== CLI_VERSION) {
      blockers.push({
        code: 'foreign-version',
        path: '.orca-kit/manifest.json',
        message: `Installed CLI version ${manifest.cliVersion} differs from ${CLI_VERSION}; v1 does not support updates.`,
      });
    }

    if (manifest !== undefined) {
      const drift = await computeDrift(this.#filesystem, repository.root, manifest);
      for (const item of drift.items) {
        blockers.push({
          code: 'drift',
          path: item.path,
          message: `${item.path} is ${item.status}; v1 refuses to overwrite local drift.`,
        });
      }
    }

    const files: PlannedFileChange[] = [];
    for (const artifact of artifacts) {
      const result = await this.planArtifact(repository.root, artifact, manifest);
      files.push(result.file);
      if (result.blocker !== undefined) blockers.push(result.blocker);
    }

    files.sort((a, b) => a.path.localeCompare(b.path));
    const uniqueBlockers = [...new Map(
      blockers.map((blocker) => [`${blocker.code}:${blocker.path}`, blocker]),
    ).values()];
    uniqueBlockers.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
    const summary = {
      create: files.filter((file) => file.action === 'create').length,
      update: files.filter((file) => file.action === 'update').length,
      unchanged: files.filter((file) => file.action === 'unchanged').length,
      blocked: uniqueBlockers.length,
    };

    return {
      schemaVersion: 1,
      command: 'init',
      repository: { root: repository.root, github: repository.github },
      profile: {
        name: command.profile,
        stability: profiles[command.profile].stability,
      },
      files,
      blockers: uniqueBlockers,
      globalCommands: [],
      githubLabelMutations: [],
      validations: [
        'Git worktree and GitHub remote recognized',
        'Configuration validates against schema version 1',
        'All target paths remain inside the repository',
        'No filesystem writes are permitted in Phase 1',
      ],
      rollbackActions: [],
      summary,
      canApply: false,
      phase: 'phase-1-read-only',
    };
  }

  public async apply(_plan: ChangePlan): Promise<ApplyReceipt> {
    return {
      applied: false,
      reason: 'Local application is intentionally unavailable until Phase 2.',
    };
  }

  public async doctor(): Promise<DoctorReport> {
    return { checks: [], phase: 'not-implemented' };
  }

  public async diff(candidatePath: string): Promise<DriftReport> {
    const repository = await this.#inspect(candidatePath);
    const { manifest, manifestBlockers } = await this.readManifest(repository.root);
    if (manifestBlockers.length > 0) {
      return {
        items: [{
          path: '.orca-kit/manifest.json',
          status: 'invalid-manifest',
          expectedHash: '',
        }],
        clean: false,
      };
    }
    if (manifest === undefined) return { items: [], clean: true };
    return computeDrift(this.#filesystem, repository.root, manifest);
  }

  private async readManifest(
    repositoryRoot: string,
  ): Promise<{ manifest?: Manifest; manifestBlockers: PlanBlocker[] }> {
    let manifestPath: string;
    try {
      manifestPath = await resolveSafeTarget(this.#filesystem, repositoryRoot, '.orca-kit/manifest.json');
    } catch (error) {
      if (!(error instanceof UnsafePathError) && !(error instanceof PathShapeError)) throw error;
      return {
        manifestBlockers: [{
          code: error instanceof UnsafePathError ? 'unsafe-path' : 'collision',
          path: '.orca-kit/manifest.json',
          message: error instanceof UnsafePathError
            ? 'The manifest path resolves outside the selected repository.'
            : 'The manifest path has an incompatible file/directory shape.',
        }],
      };
    }
    if (!(await this.#filesystem.exists(manifestPath))) return { manifestBlockers: [] };
    try {
      const manifest = manifestSchema.parse(JSON.parse(await this.#filesystem.readFile(manifestPath)));
      return { manifest, manifestBlockers: [] };
    } catch {
      return {
        manifestBlockers: [{
          code: 'invalid-manifest',
          path: '.orca-kit/manifest.json',
          message: 'The existing orca-kit manifest is not valid schema version 1 JSON.',
        }],
      };
    }
  }

  private async planArtifact(
    repositoryRoot: string,
    artifact: DesiredArtifact,
    manifest: Manifest | undefined,
  ): Promise<{ file: PlannedFileChange; blocker?: PlanBlocker }> {
    const desiredHash = sha256(artifact.content);
    let absolutePath: string;
    try {
      absolutePath = await resolveSafeTarget(this.#filesystem, repositoryRoot, artifact.path);
    } catch (error) {
      if (!(error instanceof UnsafePathError) && !(error instanceof PathShapeError)) throw error;
      return {
        file: {
          path: artifact.path,
          action: 'unchanged',
          ownership: artifact.ownership,
          desiredHash,
          reason: error instanceof UnsafePathError ? 'Target path is unsafe.' : 'Target path shape is incompatible.',
        },
        blocker: {
          code: error instanceof UnsafePathError ? 'unsafe-path' : 'collision',
          path: artifact.path,
          message: error instanceof UnsafePathError
            ? `${artifact.path} resolves outside the selected repository.`
            : `${artifact.path} has an incompatible file/directory shape.`,
        },
      };
    }
    if (!(await this.#filesystem.exists(absolutePath))) {
      return {
        file: {
          path: artifact.path,
          action: 'create',
          ownership: artifact.ownership,
          desiredHash,
          reason: 'Target does not exist.',
        },
      };
    }

    const source = await this.#filesystem.readFile(absolutePath);
    if (artifact.ownership === 'managed-block') {
      const block = inspectManagedBlock(source);
      if (block.status === 'malformed') {
        return {
          file: {
            path: artifact.path,
            action: 'unchanged',
            ownership: artifact.ownership,
            desiredHash,
            reason: 'Managed markers are malformed.',
          },
          blocker: {
            code: 'malformed-managed-block',
            path: artifact.path,
            message: 'AGENTS.md has incomplete, duplicated, or out-of-order orca-kit markers.',
          },
        };
      }
      if (block.status === 'absent') {
        return {
          file: {
            path: artifact.path,
            action: 'update',
            ownership: artifact.ownership,
            desiredHash,
            reason: 'Append a managed block while preserving existing content byte-for-byte.',
          },
        };
      }
      if (block.content === artifact.content) {
        return {
          file: {
            path: artifact.path,
            action: 'unchanged',
            ownership: artifact.ownership,
            desiredHash,
            reason: 'Managed block already matches.',
          },
        };
      }

      const isOwned = manifest?.files.some((entry) => entry.path === artifact.path) === true;
      return {
        file: {
          path: artifact.path,
          action: 'unchanged',
          ownership: artifact.ownership,
          desiredHash,
          reason: isOwned ? 'Managed content differs from desired state.' : 'Unowned managed markers collide.',
        },
        blocker: {
          code: isOwned ? 'drift' : 'collision',
          path: artifact.path,
          message: isOwned
            ? 'The managed AGENTS.md block differs from the desired content.'
            : 'AGENTS.md already contains orca-kit markers without an installation manifest.',
        },
      };
    }

    if (source === artifact.content) {
      return {
        file: {
          path: artifact.path,
          action: 'unchanged',
          ownership: artifact.ownership,
          desiredHash,
          reason: 'File already matches.',
        },
      };
    }

    return {
      file: {
        path: artifact.path,
        action: 'unchanged',
        ownership: artifact.ownership,
        desiredHash,
        reason: 'Existing content is preserved.',
      },
      blocker: {
        code: manifest === undefined ? 'collision' : 'drift',
        path: artifact.path,
        message: manifest === undefined
          ? `${artifact.path} already exists and is not managed by orca-kit.`
          : `${artifact.path} differs from the installed manifest.`,
      },
    };
  }
}
