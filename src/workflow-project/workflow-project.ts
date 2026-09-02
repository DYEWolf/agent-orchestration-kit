import path from 'node:path';
import type { FileSystemAdapter } from '../adapters/filesystem/filesystem.js';
import { NodeFileSystem } from '../adapters/filesystem/node-filesystem.js';
import { NodeHarnessAdapter } from '../adapters/harness/node-harness.js';
import type { HarnessAdapter, HarnessCheckStatus } from '../adapters/harness/harness.js';
import { insertOrReplaceManagedBlock, inspectManagedBlock } from '../artifacts/managed-block.js';
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
import { FileTransaction } from './transactions.js';
import { parse as parseYaml } from 'yaml';
import { workflowConfigSchema } from '../config/schema.js';
import { skillBundleCatalog } from '../artifacts/skill-bundle.js';

export interface InitWorkflowCommand {
  readonly type: 'init';
  readonly path: string;
  readonly profile: ProfileName;
}

export type WorkflowCommand = InitWorkflowCommand;

export interface ApplyReceipt {
  readonly applied: boolean;
  readonly reason: string;
  readonly written: readonly string[];
  readonly cleanupWarnings: readonly string[];
  readonly verified: boolean;
}

export type DoctorStatus = 'PASS' | 'WARN' | 'FAIL' | 'SKIP';

export interface DoctorCheck {
  readonly id: string;
  readonly status: DoctorStatus;
  readonly message: string;
}

export interface DoctorReport {
  readonly repositoryRoot: string;
  readonly checks: readonly DoctorCheck[];
  readonly summary: Readonly<Record<DoctorStatus, number>>;
  readonly healthy: boolean;
}

export interface WorkflowProjectContract {
  plan(command: WorkflowCommand): Promise<ChangePlan>;
  apply(plan: ChangePlan): Promise<ApplyReceipt>;
  doctor(path: string): Promise<DoctorReport>;
  diff(path: string): Promise<DriftReport>;
}

export interface WorkflowProjectDependencies {
  readonly filesystem?: FileSystemAdapter;
  readonly inspect?: (path: string) => Promise<RepositoryInspection>;
  readonly harness?: HarnessAdapter;
}

export class WorkflowProject implements WorkflowProjectContract {
  readonly #filesystem: FileSystemAdapter;
  readonly #inspect: (path: string) => Promise<RepositoryInspection>;
  readonly #harness: HarnessAdapter;

  public constructor(dependencies: WorkflowProjectDependencies = {}) {
    this.#filesystem = dependencies.filesystem ?? new NodeFileSystem();
    this.#inspect = dependencies.inspect ?? inspectRepository;
    this.#harness = dependencies.harness ?? new NodeHarnessAdapter();
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
        'Atomic local transaction and post-apply verification',
      ],
      rollbackActions: [
        'Restore every replaced file from its same-directory backup',
        'Remove every file created by the failed operation',
        'Remove empty directories created by the failed operation',
      ],
      summary,
      canApply: uniqueBlockers.length === 0,
      phase: 'phase-2-local-application',
    };
  }

  public async apply(plan: ChangePlan): Promise<ApplyReceipt> {
    if (!plan.canApply || plan.blockers.length > 0) throw new Error('ChangePlan has blockers and cannot be applied.');
    const freshPlan = await this.plan({ type: 'init', path: plan.repository.root, profile: plan.profile.name });
    if (JSON.stringify(freshPlan) !== JSON.stringify(plan)) {
      throw new Error('ChangePlan is stale; repository state changed after planning.');
    }

    const artifacts = new Map(
      renderDesiredArtifacts(resolveConfig(plan.profile.name)).map((artifact) => [artifact.path, artifact]),
    );
    const writes: { path: string; content: string }[] = [];
    for (const file of plan.files) {
      if (file.action === 'unchanged') continue;
      const artifact = artifacts.get(file.path);
      if (artifact === undefined || sha256(artifact.content) !== file.desiredHash) {
        throw new Error(`Desired artifact no longer matches ChangePlan: ${file.path}`);
      }
      const absolutePath = await resolveSafeTarget(this.#filesystem, plan.repository.root, file.path);
      const content = artifact.ownership === 'managed-block'
        ? insertOrReplaceManagedBlock(
            await this.#filesystem.exists(absolutePath) ? await this.#filesystem.readFile(absolutePath) : '',
            artifact.content,
          )
        : artifact.content;
      writes.push({ path: absolutePath, content });
    }

    if (writes.length === 0) {
      return { applied: false, reason: 'Installation already matches the desired state.', written: [], cleanupWarnings: [], verified: true };
    }

    let verified = false;
    const receipt = await new FileTransaction(this.#filesystem).apply(writes, async () => {
      const verification = await this.plan({ type: 'init', path: plan.repository.root, profile: plan.profile.name });
      verified = verification.blockers.length === 0 && verification.files.every((file) => file.action === 'unchanged');
      if (!verified) throw new Error('Post-apply verification failed.');
    });
    return {
      applied: true,
      reason: `Applied ${receipt.written.length} local file changes atomically.`,
      written: receipt.written.map((filePath) => path.relative(plan.repository.root, filePath).split(path.sep).join('/')),
      cleanupWarnings: receipt.cleanupWarnings,
      verified,
    };
  }

  public async doctor(candidatePath: string): Promise<DoctorReport> {
    const repository = await this.#inspect(candidatePath);
    const checks: DoctorCheck[] = [{
      id: 'repository',
      status: 'PASS',
      message: `GitHub repository recognized as ${repository.github.display}.`,
    }];
    const resolveDoctorPath = async (id: string, relativePath: string): Promise<string | undefined> => {
      try {
        return await resolveSafeTarget(this.#filesystem, repository.root, relativePath);
      } catch (error) {
        if (!(error instanceof UnsafePathError) && !(error instanceof PathShapeError)) throw error;
        checks.push({
          id,
          status: 'FAIL',
          message: error instanceof UnsafePathError
            ? `${relativePath} resolves outside the repository.`
            : `${relativePath} has an incompatible file/directory shape.`,
        });
        return undefined;
      }
    };
    const { manifest, manifestBlockers } = await this.readManifest(repository.root);
    if (manifest === undefined || manifestBlockers.length > 0) {
      checks.push({ id: 'manifest', status: 'FAIL', message: manifestBlockers[0]?.message ?? 'No orca-kit installation manifest exists.' });
    } else {
      checks.push({ id: 'manifest', status: 'PASS', message: `Manifest schema 1 from CLI ${manifest.cliVersion} is valid.` });
    }

    let parsedConfig: ReturnType<typeof workflowConfigSchema.parse> | undefined;
    let canonicalConfig: ReturnType<typeof workflowConfigSchema.parse> | undefined;
    let configMatches = false;
    const configPath = await resolveDoctorPath('config', '.orca-kit/config.yaml');
    if (configPath === undefined) {
      // resolveDoctorPath already recorded the failure.
    } else if (!(await this.#filesystem.exists(configPath))) {
      checks.push({ id: 'config', status: 'FAIL', message: 'Missing .orca-kit/config.yaml.' });
    } else {
      try {
        parsedConfig = workflowConfigSchema.parse(parseYaml(await this.#filesystem.readFile(configPath)));
        checks.push({ id: 'config', status: 'PASS', message: `Configuration is valid for profile ${parsedConfig.profile}.` });
        // The profile name is schema-validated, so each approved profile can
        // select its own canonical routing contract for local integrity checks.
        canonicalConfig = resolveConfig(parsedConfig.profile);
        configMatches = JSON.stringify(parsedConfig) === JSON.stringify(canonicalConfig);
        checks.push({
          id: 'config-contract',
          status: configMatches ? 'PASS' : 'FAIL',
          message: configMatches
            ? 'Configuration exactly matches the canonical installed profile.'
            : 'Configuration is structurally valid but differs from the canonical installed profile; v1 does not support reconfiguration.',
        });
      } catch {
        checks.push({ id: 'config', status: 'FAIL', message: 'Configuration is not valid schema version 1 YAML.' });
      }
    }

    if (manifest !== undefined && canonicalConfig !== undefined) {
      const desiredManifest = renderDesiredArtifacts(canonicalConfig).find((artifact) => artifact.path === '.orca-kit/manifest.json');
      const expectedManifest = desiredManifest === undefined ? undefined : manifestSchema.parse(JSON.parse(desiredManifest.content));
      const contractMatches = expectedManifest !== undefined && JSON.stringify(manifest) === JSON.stringify(expectedManifest);
      checks.push({
        id: 'manifest-contract',
        status: contractMatches ? 'PASS' : 'FAIL',
        message: contractMatches ? 'Manifest exactly matches the expected installed contract.' : 'Manifest file list or hashes differ from the expected installed contract.',
      });
    }

    const agentsPath = await resolveDoctorPath('agents-managed-block', 'AGENTS.md');
    const agentsBlock = agentsPath !== undefined && await this.#filesystem.exists(agentsPath)
      ? inspectManagedBlock(await this.#filesystem.readFile(agentsPath))
      : { status: 'absent' as const };
    if (agentsPath !== undefined) {
      checks.push({
        id: 'agents-managed-block',
        status: agentsBlock.status === 'valid' ? 'PASS' : 'FAIL',
        message: agentsBlock.status === 'valid' ? 'AGENTS.md managed block is well formed.' : 'AGENTS.md managed block is missing or malformed.',
      });
    }

    const missingSkills: string[] = [];
    for (const skill of skillBundleCatalog.skills) {
      for (const relativePath of [...Object.keys(skill.files), 'PROVENANCE.json']) {
        const displayPath = `.agents/skills/${skill.name}/${relativePath}`;
        const skillPath = await resolveDoctorPath('skills-path', displayPath);
        if (skillPath === undefined || !(await this.#filesystem.exists(skillPath))) missingSkills.push(`${skill.name}/${relativePath}`);
      }
    }
    checks.push({
      id: 'skills',
      status: missingSkills.length === 0 ? 'PASS' : 'FAIL',
      message: missingSkills.length === 0 ? `All ${skillBundleCatalog.skills.length} skills are installed with metadata and provenance.` : `Missing skill artifacts: ${missingSkills.join(', ')}`,
    });

    const noticesPath = await resolveDoctorPath('attribution', '.agents/THIRD_PARTY_NOTICES.md');
    if (noticesPath !== undefined) {
      const noticeContent = await this.#filesystem.exists(noticesPath) ? await this.#filesystem.readFile(noticesPath) : '';
      const upstreamNamesPresent = skillBundleCatalog.skills
        .filter((skill) => skill.origin.kind === 'upstream')
        .every((skill) => noticeContent.includes(`- \`${skill.name}\`:`));
      const firstPartyNamesAbsent = skillBundleCatalog.skills
        .filter((skill) => skill.origin.kind === 'first-party')
        .every((skill) => !noticeContent.includes(`- \`${skill.name}\`:`));
      const noticesValid = noticeContent.includes(skillBundleCatalog.upstreamCommit)
        && noticeContent.includes('MIT License') && upstreamNamesPresent && firstPartyNamesAbsent;
      checks.push({ id: 'attribution', status: noticesValid ? 'PASS' : 'FAIL', message: noticesValid ? 'Pinned upstream attribution and MIT license are present.' : 'Third-party attribution is missing or incomplete.' });
    }

    if (manifest !== undefined) {
      const drift = await computeDrift(this.#filesystem, repository.root, manifest);
      checks.push({ id: 'drift', status: drift.clean ? 'PASS' : 'FAIL', message: drift.clean ? 'No local drift detected.' : `${drift.items.length} generated artifact(s) are missing or modified.` });
    } else {
      checks.push({ id: 'drift', status: 'FAIL', message: 'Drift cannot be checked without a valid manifest.' });
    }

    const requiresClaude = parsedConfig !== undefined
      && profiles[parsedConfig.profile].requires.includes('claude');
    if (requiresClaude && canonicalConfig !== undefined) {
      const harness = await this.#harness.checkClaude();
      checks.push(
        {
          id: 'claude-cli',
          status: toDoctorStatus(harness.cli.status),
          message: harness.cli.message,
        },
        {
          id: 'claude-version',
          status: toDoctorStatus(harness.version.status),
          message: harness.version.message,
        },
        {
          id: 'claude-auth',
          status: toDoctorStatus(harness.authentication.status),
          message: harness.authentication.message,
        },
        {
          id: 'claude-compatibility',
          status: harness.cli.status === 'pass'
            && harness.version.status === 'pass'
            && harness.authentication.status === 'pass'
            ? 'PASS'
            : 'FAIL',
          message: harness.cli.status === 'pass'
            && harness.version.status === 'pass'
            && harness.authentication.status === 'pass'
            ? 'Claude Code CLI, minimum version, and authentication checks passed.'
            : 'Claude Code compatibility checks failed; resolve the individual Claude checks above before using this profile.',
        },
      );
      const expectedClaudeArtifacts = renderDesiredArtifacts(canonicalConfig).filter((artifact) =>
        artifact.path === 'CLAUDE.md' || artifact.path.startsWith('.claude/skills/'));
      const claudeIssues: string[] = [];
      for (const artifact of expectedClaudeArtifacts) {
        try {
          const artifactPath = await resolveSafeTarget(this.#filesystem, repository.root, artifact.path);
          if (!(await this.#filesystem.exists(artifactPath))) {
            claudeIssues.push(`${artifact.path} is missing`);
          } else if (await this.#filesystem.readFile(artifactPath) !== artifact.content) {
            claudeIssues.push(`${artifact.path} is modified`);
          }
        } catch (error) {
          if (error instanceof UnsafePathError || error instanceof PathShapeError) {
            claudeIssues.push(`${artifact.path} has an unsafe or incompatible path`);
          } else {
            throw error;
          }
        }
      }
      checks.push({
        id: 'claude-discovery',
        status: claudeIssues.length === 0 ? 'PASS' : 'FAIL',
        message: claudeIssues.length === 0
          ? `CLAUDE.md and all ${skillBundleCatalog.skills.length} canonical-body Claude skill wrappers are intact.`
          : `Claude compatibility artifacts are incomplete: ${claudeIssues.join(', ')}.`,
      });
    } else {
      checks.push({
        id: 'claude-discovery',
        status: 'SKIP',
        message: 'No Claude compatibility artifacts are required for this profile.',
      });
      checks.push({
        id: 'claude-compatibility',
        status: 'SKIP',
        message: 'Claude compatibility is not applicable to the codex-only profile; no Claude checks were executed.',
      });
    }
    checks.push(
      {
        id: 'routing-local',
        status: parsedConfig === undefined ? 'SKIP' : !configMatches ? 'FAIL' : profiles[parsedConfig.profile].stability === 'stable' ? 'PASS' : 'WARN',
        message: parsedConfig === undefined
          ? 'Routing compatibility cannot be checked without valid configuration.'
          : !configMatches
            ? 'Routing configuration differs from the canonical approved profile contract.'
            : profiles[parsedConfig.profile].stability === 'stable'
              ? `Local routing configuration for ${parsedConfig.profile} is structurally complete.`
              : `Local routing configuration for ${parsedConfig.profile} is complete; live Claude-worker validation is still pending.`,
      },
      { id: 'external-orca', status: 'SKIP', message: 'Orca runtime and repository registration checks arrive in Phase 4.' },
      { id: 'external-github', status: 'SKIP', message: 'GitHub CLI authentication and label checks arrive in Phase 4.' },
    );
    const summary = { PASS: 0, WARN: 0, FAIL: 0, SKIP: 0 } satisfies Record<DoctorStatus, number>;
    for (const check of checks) summary[check.status] += 1;
    return { repositoryRoot: repository.root, checks, summary, healthy: summary.FAIL === 0 };
  }

  public async diff(candidatePath: string): Promise<DriftReport> {
    const repository = await this.#inspect(candidatePath);
    const { manifest, manifestBlockers } = await this.readManifest(repository.root);
    if (manifestBlockers.length > 0) {
      return {
        installation: 'invalid',
        items: [{
          path: '.orca-kit/manifest.json',
          status: 'invalid-manifest',
          expectedHash: '',
        }],
        clean: false,
      };
    }
    if (manifest === undefined) return {
      installation: 'missing',
      items: [{ path: '.orca-kit/manifest.json', status: 'missing', expectedHash: '' }],
      clean: false,
    };
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

    // Claude compatibility files are user-owned unless the exact artifact is
    // recorded in the manifest, even when its bytes already match our output.
    // This prevents a first install from silently adopting an existing file.
    if (isClaudeCompatibilityPath(artifact.path)) {
      const ownsArtifact = manifest?.files.some((entry) => entry.path === artifact.path) === true;
      if (!ownsArtifact && await this.#filesystem.exists(absolutePath)) {
        return {
          file: {
            path: artifact.path,
            action: 'unchanged',
            ownership: artifact.ownership,
            desiredHash,
            reason: 'Existing content is preserved.',
          },
          blocker: {
            code: 'collision',
            path: artifact.path,
            message: `${artifact.path} already exists and is not managed by orca-kit.`,
          },
        };
      }
    }

    // Claude discovers skills by directory. A pre-existing skill directory is
    // user-owned unless this exact wrapper is recorded in the manifest, even
    // when the wrapper file itself has not been created yet.
    if (isClaudeWrapperPath(artifact.path)) {
      const ownsWrapper = manifest?.files.some((entry) => entry.path === artifact.path) === true;
      if (!ownsWrapper && await this.#filesystem.entryKind(path.dirname(absolutePath)) === 'directory') {
        return {
          file: {
            path: artifact.path,
            action: 'unchanged',
            ownership: artifact.ownership,
            desiredHash,
            reason: 'An unmanaged Claude skill directory already exists.',
          },
          blocker: {
            code: 'collision',
            path: artifact.path,
            message: `The Claude skill directory for ${artifact.path} already exists and is not managed by orca-kit.`,
          },
        };
      }
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

function isClaudeWrapperPath(relativePath: string): boolean {
  return relativePath.startsWith('.claude/skills/') && relativePath.endsWith('/SKILL.md');
}

function isClaudeCompatibilityPath(relativePath: string): boolean {
  return relativePath === 'CLAUDE.md' || isClaudeWrapperPath(relativePath);
}

function toDoctorStatus(status: HarnessCheckStatus): DoctorStatus {
  if (status === 'pass') return 'PASS';
  if (status === 'fail') return 'FAIL';
  return 'SKIP';
}
