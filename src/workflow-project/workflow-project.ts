import path from 'node:path';
import type { FileSystemAdapter } from '../adapters/filesystem/filesystem.js';
import { NodeFileSystem } from '../adapters/filesystem/node-filesystem.js';
import { NodeHarnessAdapter } from '../adapters/harness/node-harness.js';
import type { HarnessAdapter, HarnessCheckStatus } from '../adapters/harness/harness.js';
import { NodeOrcaAdapter } from '../adapters/orca/node-orca.js';
import { requiredOrcaActions, type OrcaAdapter, type OrcaCheck } from '../adapters/orca/orca.js';
import { NodeGitHubAdapter } from '../adapters/github/node-github.js';
import { requiredGitHubActions, type GitHubAdapter, type GitHubCheck, type GitHubDiscovery } from '../adapters/github/github.js';
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
import type { ChangePlan, PlanBlocker, PlannedFileChange, PlannedGitHubLabelMutation } from './change-plan.js';
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
  readonly global?: boolean;
  readonly orcaRegistration?: boolean;
  readonly githubMutations?: boolean;
}

export type WorkflowCommand = InitWorkflowCommand;

export interface ApplyReceipt {
  readonly applied: boolean;
  readonly reason: string;
  readonly written: readonly string[];
  readonly cleanupWarnings: readonly string[];
  readonly verified: boolean;
  readonly externalActions: readonly { readonly id: string; readonly status: 'executed' | 'failed'; readonly message: string }[];
  readonly githubActions: readonly { readonly id: string; readonly status: 'executed' | 'failed'; readonly message: string }[];
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
  readonly orca?: OrcaAdapter;
  readonly github?: GitHubAdapter;
}

export class WorkflowProject implements WorkflowProjectContract {
  readonly #filesystem: FileSystemAdapter;
  readonly #inspect: (path: string) => Promise<RepositoryInspection>;
  readonly #harness: HarnessAdapter;
  readonly #orca: OrcaAdapter;
  readonly #github: GitHubAdapter;

  public constructor(dependencies: WorkflowProjectDependencies = {}) {
    this.#filesystem = dependencies.filesystem ?? new NodeFileSystem();
    this.#inspect = dependencies.inspect ?? inspectRepository;
    this.#harness = dependencies.harness ?? new NodeHarnessAdapter();
    this.#orca = dependencies.orca ?? new NodeOrcaAdapter();
    this.#github = dependencies.github ?? new NodeGitHubAdapter();
  }

  public async plan(command: WorkflowCommand): Promise<ChangePlan> {
    return this.planInternal(command, true);
  }

  /** Plan the local transaction without allowing a later remote read to veto it. */
  private async planInternal(command: WorkflowCommand, includeGitHub: boolean): Promise<ChangePlan> {
    const repository = await this.#inspect(command.path);
    const repositoryRoot = await this.#filesystem.realpath(repository.root);
    const config = resolveConfig(command.profile);
    const globalEnabled = command.global !== false;
    const registrationEnabled = command.orcaRegistration !== false;
    const artifacts = renderDesiredArtifacts(config);
    const { manifest, manifestBlockers } = await this.readManifest(repositoryRoot);
    const blockers: PlanBlocker[] = [...manifestBlockers];

    if (manifest !== undefined && manifest.cliVersion !== CLI_VERSION) {
      blockers.push({
        code: 'foreign-version',
        path: '.agent-orchestration-kit/manifest.json',
        message: `Installed CLI version ${manifest.cliVersion} differs from ${CLI_VERSION}; v1 does not support updates.`,
      });
    }

    if (manifest !== undefined) {
      const drift = await computeDrift(this.#filesystem, repositoryRoot, manifest);
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
      const result = await this.planArtifact(repositoryRoot, artifact, manifest);
      files.push(result.file);
      if (result.blocker !== undefined) blockers.push(result.blocker);
    }

    files.sort((a, b) => a.path.localeCompare(b.path));
    const discovery = await this.#orca.discover(repositoryRoot);
    const external = requiredOrcaActions(discovery.repositoryTarget ?? repositoryRoot);
    const coreAvailable = discovery.cli.status === 'pass'
      && discovery.compatibility.status === 'pass'
      && discovery.readiness.status === 'pass';
    const globalAction = toPlannedAction(external[0]!, globalEnabled, discovery.globalSkill, coreAvailable && discovery.canInstallSkill);
    const registrationAction = toPlannedAction(external[1]!, registrationEnabled, discovery.repository, coreAvailable && discovery.canRegisterRepository);
    let githubAction: PlannedGitHubLabelMutation;
    if (includeGitHub) {
      const githubDiscovery = await this.#github.discover(repository.github);
      const requiredGitHubAction = requiredGitHubActions(repository.github, githubDiscovery.repositoryNodeId ?? '')[0]!;
      githubAction = toPlannedGitHubAction(requiredGitHubAction, command.githubMutations !== false, githubDiscovery);
      for (const blocker of githubPrerequisiteBlockers(repository.github.display, githubDiscovery)) blockers.push(blocker);
    } else {
      // This path is used only for local verification. It deliberately omits
      // remote discovery and therefore cannot enumerate a remote mutation.
      const localOnlyAction = requiredGitHubActions(repository.github, '')[0]!;
      githubAction = { ...localOnlyAction, state: 'suppressed', reason: 'Skipped during local post-apply verification.' };
    }
    const finalBlockers = [...new Map(
      blockers.map((blocker) => [`${blocker.code}:${blocker.path}`, blocker]),
    ).values()].sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
    const finalSummary = {
      create: files.filter((file) => file.action === 'create').length,
      update: files.filter((file) => file.action === 'update').length,
      unchanged: files.filter((file) => file.action === 'unchanged').length,
      blocked: finalBlockers.length,
    };
    return {
      schemaVersion: 1,
      command: 'init',
      repository: { root: repositoryRoot, github: repository.github },
      profile: {
        name: command.profile,
        stability: profiles[command.profile].stability,
      },
      files,
      blockers: finalBlockers,
      globalCommands: [globalAction, registrationAction],
      githubLabelMutations: [githubAction],
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
      summary: finalSummary,
      canApply: finalBlockers.length === 0,
      phase: 'phase-4-orca-application',
    };
  }

  public async apply(plan: ChangePlan): Promise<ApplyReceipt> {
    if (!plan.canApply || plan.blockers.length > 0) throw new Error('ChangePlan has blockers and cannot be applied.');
    const freshPlan = await this.plan({
      type: 'init', path: plan.repository.root, profile: plan.profile.name,
      global: plan.globalCommands.some((action) => action.id === 'install-orchestration-skill' && action.state !== 'suppressed'),
      orcaRegistration: plan.globalCommands.some((action) => action.id === 'register-repository' && action.state !== 'suppressed'),
      githubMutations: plan.githubLabelMutations.some((action) => action.state !== 'suppressed'),
    });
    validatePlannedActions(plan, freshPlan);
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

    let verified = false;
    let githubExecutionAllowed = true;
    const plannedGitHubActions = plan.githubLabelMutations.filter((action) => action.state === 'planned');
    const refreshGitHubAuthorization = async (): Promise<void> => {
      if (plannedGitHubActions.length === 0) return;
      try {
        const postApplyGitHub = await this.#github.discover(plan.repository.github);
        const plannedGitHubAction = plannedGitHubActions[0];
        if (plannedGitHubAction === undefined) {
          githubExecutionAllowed = false;
          return;
        }
        const postApplyAction = postApplyGitHub.repositoryNodeId === undefined
          ? undefined
          : requiredGitHubActions(plan.repository.github, postApplyGitHub.repositoryNodeId)[0];
        githubExecutionAllowed = postApplyAction !== undefined
          && isAuthoritativeMissingLabel(postApplyGitHub)
          && samePlannedGitHubAction(plannedGitHubAction, postApplyAction);
      } catch {
        githubExecutionAllowed = false;
      }
    };
    const receipt = writes.length === 0 ? { written: [] as string[], cleanupWarnings: [] as string[] } : await new FileTransaction(this.#filesystem).apply(writes, async () => {
      const verification = await this.planInternal({ type: 'init', path: plan.repository.root, profile: plan.profile.name, global: false, orcaRegistration: false }, false);
      verified = verification.blockers.length === 0 && verification.files.every((file) => file.action === 'unchanged');
      if (!verified) throw new Error('Post-apply verification failed.');
      // Keep the remote read as a diagnostic/authorization refresh, but do not
      // let an unavailable remote invalidate a consistent local transaction.
      await refreshGitHubAuthorization();
    });
    if (writes.length === 0) {
      verified = true;
      await refreshGitHubAuthorization();
    }
    const externalActions: { id: string; status: 'executed' | 'failed'; message: string }[] = [];
    const githubActions: { id: string; status: 'executed' | 'failed'; message: string }[] = [];
    const plannedActions = plan.globalCommands.filter((action) => action.state === 'planned');
    for (const action of plannedActions) {
      let result: { id: string; status: 'executed' | 'failed'; message: string };
      try {
        const externalResult = await this.#orca.execute({ id: action.id, argv: action.argv });
        result = externalResult.status === 'executed'
          ? { id: action.id, status: 'executed', message: `Orca action ${action.id} completed.` }
          : { id: action.id, status: 'failed', message: `Orca action ${action.id} failed.` };
      } catch {
        result = { id: action.id, status: 'failed', message: `Orca action ${action.id} could not be executed.` };
      }
      externalActions.push(result);
      if (result.status === 'failed') {
        const later = plannedActions.slice(externalActions.length).map((candidate) => candidate.id);
        const reason = writes.length > 0
          ? `Local installation is consistent, but ${result.message}`
          : `No local files changed; ${result.message}${later.length === 0 ? '' : ` Later planned action${later.length === 1 ? '' : 's'} ${later.join(', ')} ${later.length === 1 ? 'was' : 'were'} not attempted.`}`;
        return {
          applied: writes.length > 0,
          reason,
          written: receipt.written.map((filePath) => path.relative(plan.repository.root, filePath).split(path.sep).join('/')),
          cleanupWarnings: receipt.cleanupWarnings,
          verified,
          externalActions,
          githubActions,
        };
      }
    }
    for (const action of plannedGitHubActions) {
      let result: { id: string; status: 'executed' | 'failed'; message: string };
      if (!githubExecutionAllowed) {
        result = {
          id: action.id,
          status: 'failed',
          message: `GitHub action ${action.id} was not executed because post-apply GitHub discovery was unavailable or changed.`,
        };
      } else {
        try {
          const githubResult = await this.#github.execute(action);
          result = githubResult.status === 'executed'
            ? { id: action.id, status: 'executed', message: `GitHub action ${action.id} completed.` }
            : { id: action.id, status: 'failed', message: `GitHub action ${action.id} failed.` };
        } catch {
          result = { id: action.id, status: 'failed', message: `GitHub action ${action.id} could not be executed.` };
        }
      }
      githubActions.push(result);
      if (result.status === 'failed') {
        const reason = writes.length > 0
          ? `Local installation is consistent, but ${result.message}`
          : `No local files changed; ${result.message}`;
        return {
          applied: writes.length > 0,
          reason,
          written: receipt.written.map((filePath) => path.relative(plan.repository.root, filePath).split(path.sep).join('/')),
          cleanupWarnings: receipt.cleanupWarnings,
          verified,
          externalActions,
          githubActions,
        };
      }
    }
    const reason = writes.length > 0
      ? `Applied ${receipt.written.length} local file changes atomically.`
      : externalActions.length === 0 && githubActions.length === 0
        ? 'No local files changed; no Orca actions were executed.'
        : githubActions.length === 0
          ? `No local files changed; ${externalActions.length} Orca actions completed successfully: ${externalActions.map((action) => action.id).join(', ')}.`
          : externalActions.length === 0
            ? `No local files changed; ${githubActions.length} GitHub action${githubActions.length === 1 ? '' : 's'} completed successfully: ${githubActions.map((action) => action.id).join(', ')}.`
            : `No local files changed; ${externalActions.length} Orca action${externalActions.length === 1 ? '' : 's'} and ${githubActions.length} GitHub action${githubActions.length === 1 ? '' : 's'} completed successfully.`;
    return {
      applied: writes.length > 0,
      reason,
      written: receipt.written.map((filePath) => path.relative(plan.repository.root, filePath).split(path.sep).join('/')),
      cleanupWarnings: receipt.cleanupWarnings,
      verified,
      externalActions,
      githubActions,
    };
  }

  public async doctor(candidatePath: string): Promise<DoctorReport> {
    const repository = await this.#inspect(candidatePath);
    const checks: DoctorCheck[] = [{
      id: 'repository',
      status: 'PASS',
      message: `GitHub repository recognized as ${repository.github.display}.`,
    }];
    const github = await this.#github.discover(repository.github);
    checks.push(
      doctorGitHubCheck('github-cli', github.cli),
      doctorGitHubPrerequisiteCheck('github-auth', github.cli, github.auth),
      doctorGitHubRepositoryCheck(github),
      doctorGitHubLabelCheck(github),
    );
    const orca = await this.#orca.discover(repository.root);
    checks.push(
      doctorOrcaCheck('orca-cli', orca.cli, orca.compatibility),
      doctorCheck('orca-readiness', orca.readiness),
      doctorCheck('orca-global-skill', orca.globalSkill),
      doctorCheck('orca-repository-registration', orca.repository),
    );
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
      checks.push({ id: 'manifest', status: 'FAIL', message: manifestBlockers[0]?.message ?? 'No agent-orchestration-kit installation manifest exists.' });
    } else {
      checks.push({ id: 'manifest', status: 'PASS', message: `Manifest schema 1 from CLI ${manifest.cliVersion} is valid.` });
    }

    let parsedConfig: ReturnType<typeof workflowConfigSchema.parse> | undefined;
    let canonicalConfig: ReturnType<typeof workflowConfigSchema.parse> | undefined;
    let configMatches = false;
    const configPath = await resolveDoctorPath('config', '.agent-orchestration-kit/config.yaml');
    if (configPath === undefined) {
      // resolveDoctorPath already recorded the failure.
    } else if (!(await this.#filesystem.exists(configPath))) {
      checks.push({ id: 'config', status: 'FAIL', message: 'Missing .agent-orchestration-kit/config.yaml.' });
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
      const desiredManifest = renderDesiredArtifacts(canonicalConfig).find((artifact) => artifact.path === '.agent-orchestration-kit/manifest.json');
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
          path: '.agent-orchestration-kit/manifest.json',
          status: 'invalid-manifest',
          expectedHash: '',
        }],
        clean: false,
      };
    }
    if (manifest === undefined) return {
      installation: 'missing',
      items: [{ path: '.agent-orchestration-kit/manifest.json', status: 'missing', expectedHash: '' }],
      clean: false,
    };
    return computeDrift(this.#filesystem, repository.root, manifest);
  }

  private async readManifest(
    repositoryRoot: string,
  ): Promise<{ manifest?: Manifest; manifestBlockers: PlanBlocker[] }> {
    let manifestPath: string;
    try {
      manifestPath = await resolveSafeTarget(this.#filesystem, repositoryRoot, '.agent-orchestration-kit/manifest.json');
    } catch (error) {
      if (!(error instanceof UnsafePathError) && !(error instanceof PathShapeError)) throw error;
      return {
        manifestBlockers: [{
          code: error instanceof UnsafePathError ? 'unsafe-path' : 'collision',
          path: '.agent-orchestration-kit/manifest.json',
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
          path: '.agent-orchestration-kit/manifest.json',
          message: 'The existing agent-orchestration-kit manifest is not valid schema version 1 JSON.',
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
            message: `${artifact.path} already exists and is not managed by agent-orchestration-kit.`,
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
            message: `The Claude skill directory for ${artifact.path} already exists and is not managed by agent-orchestration-kit.`,
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
            message: 'AGENTS.md has incomplete, duplicated, or out-of-order agent-orchestration-kit markers.',
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
            : 'AGENTS.md already contains agent-orchestration-kit markers without an installation manifest.',
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
          ? `${artifact.path} already exists and is not managed by agent-orchestration-kit.`
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

function validatePlannedActions(plan: ChangePlan, freshPlan: ChangePlan): void {
  if (plan.globalCommands.length !== freshPlan.globalCommands.length || plan.githubLabelMutations.length !== freshPlan.githubLabelMutations.length) {
    throw new Error('ChangePlan contains an unsupported external action.');
  }
  for (const action of plan.globalCommands) {
    const allowed = freshPlan.globalCommands.find((candidate) => candidate.id === action.id);
    if (allowed === undefined || !samePlannedAction(action, allowed)) {
      throw new Error('ChangePlan contains an unsupported Orca action or argv.');
    }
  }
  for (const action of plan.githubLabelMutations) {
    const allowed = freshPlan.githubLabelMutations.find((candidate) => candidate.id === action.id);
    if (allowed === undefined || !samePlannedGitHubAction(action, allowed)) {
      throw new Error('ChangePlan contains an unsupported GitHub action, metadata, or argv.');
    }
  }
}

function samePlannedAction(
  left: ChangePlan['globalCommands'][number],
  right: ChangePlan['globalCommands'][number],
): boolean {
  return left.target === right.target && left.argv.length === right.argv.length
    && left.argv.every((part, index) => part === right.argv[index]);
}

function samePlannedGitHubAction(
  left: ChangePlan['githubLabelMutations'][number],
  right: ChangePlan['githubLabelMutations'][number] | ReturnType<typeof requiredGitHubActions>[number],
): boolean {
  return left.repositoryNodeId === right.repositoryNodeId && left.target === right.target && left.name === right.name && left.color === right.color
    && left.description === right.description
    && left.argv.length === right.argv.length && left.argv.every((part, index) => part === right.argv[index]);
}

function toPlannedAction(
  action: { readonly id: 'install-orchestration-skill' | 'register-repository'; readonly argv: readonly string[] },
  enabled: boolean,
  check: OrcaCheck,
  available: boolean,
): ChangePlan['globalCommands'][number] {
  const target = action.id === 'install-orchestration-skill' ? 'global orchestration skill' : action.argv[action.argv.length - 1]!;
  if (!enabled) return { ...action, target, state: 'suppressed', reason: 'Disabled by this init invocation.' };
  if (!available || check.status === 'skip') return { ...action, target, state: 'unavailable', reason: check.message };
  if (check.status === 'pass') return { ...action, target, state: 'already-satisfied', reason: check.message };
  return { ...action, target, state: 'planned', reason: check.message };
}

function toPlannedGitHubAction(
  action: ReturnType<typeof requiredGitHubActions>[number],
  enabled: boolean,
  discovery: GitHubDiscovery,
): PlannedGitHubLabelMutation {
  if (!enabled) return { ...action, state: 'suppressed', reason: 'Disabled by this init invocation.' };
  if (isAuthoritativeMissingLabel(discovery)) {
    return { ...action, state: 'planned', reason: discovery.label.message };
  }
  if (discovery.labelState === 'exact') {
    return { ...action, state: 'already-satisfied', reason: discovery.label.message };
  }
  if (discovery.labelState === 'drift') {
    return { ...action, state: 'already-satisfied', reason: discovery.label.message };
  }
  return { ...action, state: 'unavailable', reason: discovery.label.message };
}

function isAuthoritativeMissingLabel(discovery: GitHubDiscovery): boolean {
  return discovery.cli.status === 'pass'
    && discovery.auth.status === 'pass'
    && discovery.repository.status === 'pass'
    && typeof discovery.repositoryNodeId === 'string'
    && discovery.repositoryNodeId.length > 0
    && typeof discovery.repositoryNameWithOwner === 'string'
    && discovery.labelState === 'missing'
    && discovery.canCreateLabel;
}

function githubPrerequisiteBlockers(repositoryDisplay: string, discovery: GitHubDiscovery): PlanBlocker[] {
  const blockers: PlanBlocker[] = [];
  if (discovery.cli.status !== 'pass') blockers.push({
    code: 'github-prerequisite',
    path: repositoryDisplay,
    message: discovery.cli.message,
  });
  else if (discovery.auth.status !== 'pass') blockers.push({
    code: 'github-prerequisite',
    path: repositoryDisplay,
    message: discovery.auth.message,
  });
  else if (discovery.repository.status !== 'pass') blockers.push({
    code: 'github-prerequisite',
    path: repositoryDisplay,
    message: discovery.repository.message,
  });
  else if (discovery.label.status !== 'pass'
    && !(discovery.labelState === 'missing' && discovery.canCreateLabel)
    && discovery.labelState !== 'drift' && discovery.labelState !== 'exact') blockers.push({
    code: 'github-prerequisite',
    path: repositoryDisplay,
    message: discovery.label.message,
  });
  return blockers;
}

function doctorCheck(id: string, check: OrcaCheck): DoctorCheck {
  return { id, status: check.status === 'pass' ? 'PASS' : check.status === 'fail' ? 'FAIL' : 'SKIP', message: check.message };
}

function doctorOrcaCheck(id: string, cli: OrcaCheck, compatibility: OrcaCheck): DoctorCheck {
  if (cli.status === 'fail') return doctorCheck(id, cli);
  return doctorCheck(id, compatibility);
}

function doctorGitHubCheck(id: string, check: GitHubCheck): DoctorCheck {
  return { id, status: check.status === 'pass' ? 'PASS' : check.status === 'warn' ? 'WARN' : check.status === 'fail' ? 'FAIL' : 'SKIP', message: check.message };
}

function doctorGitHubPrerequisiteCheck(id: string, prerequisite: GitHubCheck, check: GitHubCheck): DoctorCheck {
  return prerequisite.status !== 'pass' ? { id, status: 'SKIP', message: `Skipped because the GitHub prerequisite check did not pass: ${prerequisite.message}` } : doctorGitHubCheck(id, check);
}

function doctorGitHubRepositoryCheck(discovery: GitHubDiscovery): DoctorCheck {
  if (discovery.cli.status !== 'pass') return { id: 'github-repository', status: 'SKIP', message: 'Skipped because GitHub CLI is unavailable.' };
  if (discovery.auth.status !== 'pass') return { id: 'github-repository', status: 'SKIP', message: 'Skipped because GitHub authentication did not pass.' };
  return doctorGitHubCheck('github-repository', discovery.repository);
}

function doctorGitHubLabelCheck(discovery: GitHubDiscovery): DoctorCheck {
  if (discovery.cli.status !== 'pass') return { id: 'github-ready-for-agent-label', status: 'SKIP', message: 'Skipped because GitHub CLI is unavailable.' };
  if (discovery.auth.status !== 'pass') return { id: 'github-ready-for-agent-label', status: 'SKIP', message: 'Skipped because GitHub authentication did not pass.' };
  if (discovery.repository.status !== 'pass') return { id: 'github-ready-for-agent-label', status: 'SKIP', message: 'Skipped because the GitHub repository could not be verified.' };
  return doctorGitHubCheck('github-ready-for-agent-label', discovery.label);
}

function toDoctorStatus(status: HarnessCheckStatus): DoctorStatus {
  if (status === 'pass') return 'PASS';
  if (status === 'fail') return 'FAIL';
  return 'SKIP';
}
