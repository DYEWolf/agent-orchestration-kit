import path from 'node:path';
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { InMemoryFileSystem } from '../src/adapters/filesystem/in-memory-filesystem.js';
import { NodeFileSystem } from '../src/adapters/filesystem/node-filesystem.js';
import { FakeHarnessAdapter } from '../src/adapters/harness/fake-harness.js';
import { FakeOrcaAdapter } from '../src/adapters/orca/fake-orca.js';
import { NodeOrcaAdapter } from '../src/adapters/orca/node-orca.js';
import type { ClaudeHarnessReport } from '../src/adapters/harness/harness.js';
import { renderDesiredArtifacts } from '../src/artifacts/render.js';
import { skillBundleCatalog } from '../src/artifacts/skill-bundle.js';
import { inspectManagedBlock } from '../src/artifacts/managed-block.js';
import { resolveConfig } from '../src/config/profiles.js';
import type { RepositoryInspection } from '../src/repository/inspection.js';
import { sha256 } from '../src/shared/hash.js';
import { WorkflowProject } from '../src/workflow-project/workflow-project.js';
import type { OrcaAction, OrcaActionReceipt, OrcaAdapter, OrcaDiscovery } from '../src/adapters/orca/orca.js';

const root = path.resolve('/fixture/repository');
const inspection: RepositoryInspection = {
  root,
  gitDirectory: path.join(root, '.git'),
  github: {
    host: 'github.com',
    owner: 'DYEWolf',
    name: 'example',
    remoteName: 'origin',
    display: 'github.com/DYEWolf/example',
  },
};

function createWorkflow(
  files: Readonly<Record<string, string>> = {},
  harness = new FakeHarnessAdapter(),
) {
  const filesystem = new InMemoryFileSystem(root, files);
  const workflow = new WorkflowProject({
    filesystem,
    inspect: async () => inspection,
    harness,
    orca: new FakeOrcaAdapter({
      cli: { status: 'pass', message: 'fake' }, compatibility: { status: 'pass', message: 'fake' },
      readiness: { status: 'pass', message: 'fake' }, globalSkill: { status: 'pass', message: 'fake' },
      repository: { status: 'pass', message: 'fake' }, canInstallSkill: true, canRegisterRepository: true,
    }),
  });
  return { filesystem, workflow };
}

function orcaDiscovery(overrides: Partial<OrcaDiscovery> = {}): OrcaDiscovery {
  const check = { status: 'pass' as const, message: 'fake' };
  return {
    cli: check,
    compatibility: check,
    readiness: check,
    globalSkill: check,
    repository: check,
    canInstallSkill: true,
    canRegisterRepository: true,
    ...overrides,
  };
}

class MutableOrcaAdapter implements OrcaAdapter {
  public actions: OrcaAction[] = [];
  public constructor(public discovery: OrcaDiscovery, private readonly failure?: OrcaAction['id']) {}
  public async discover(_repositoryRoot: string): Promise<OrcaDiscovery> { return this.discovery; }
  public async execute(action: OrcaAction): Promise<OrcaActionReceipt> {
    this.actions.push(action);
    if (action.id === this.failure) return { id: action.id, status: 'failed', message: 'unsafe fake diagnostic secret-sentinel' };
    return { id: action.id, status: 'executed', message: 'unsafe fake success secret-sentinel' };
  }
}

describe('WorkflowProject planning', () => {
  it('is deterministic and performs no writes', async () => {
    const { filesystem, workflow } = createWorkflow();
    const before = filesystem.snapshot();
    const first = await workflow.plan({ type: 'init', path: root, profile: 'codex-only' });
    const second = await workflow.plan({ type: 'init', path: root, profile: 'codex-only' });
    const artifactCount = renderDesiredArtifacts(resolveConfig('codex-only')).length;
    expect(second).toEqual(first);
    expect(filesystem.snapshot()).toEqual(before);
    expect(first.summary).toEqual({ create: artifactCount, update: 0, unchanged: 0, blocked: 0 });
    expect(first.canApply).toBe(true);
  });

  it('enumerates global skill and repository registration independently, including disable states', async () => {
    const orca = new FakeOrcaAdapter({
      cli: { status: 'pass', message: 'fake' }, compatibility: { status: 'pass', message: 'fake' }, readiness: { status: 'pass', message: 'fake' },
      globalSkill: { status: 'fail', message: 'skill absent' }, repository: { status: 'fail', message: 'repo absent' }, canInstallSkill: true, canRegisterRepository: true,
    });
    const filesystem = new InMemoryFileSystem(root);
    const workflow = new WorkflowProject({ filesystem, inspect: async () => inspection, orca });
    const plan = await workflow.plan({ type: 'init', path: root, profile: 'codex-only', global: false });
    expect(plan.globalCommands).toEqual([
      expect.objectContaining({ id: 'install-orchestration-skill', state: 'suppressed', argv: ['skills', 'install', '--skill', 'orchestration'] }),
      expect.objectContaining({ id: 'register-repository', state: 'planned', argv: ['repo', 'add', '--path', root] }),
    ]);
    const allSuppressed = await workflow.plan({ type: 'init', path: root, profile: 'codex-only', global: false, orcaRegistration: false });
    expect(allSuppressed.globalCommands.every((action) => action.state === 'suppressed')).toBe(true);
  });

  it('writes locally before planned Orca actions and preserves local success after external failure', async () => {
    const orca = new FakeOrcaAdapter({
      cli: { status: 'pass', message: 'fake' }, compatibility: { status: 'pass', message: 'fake' }, readiness: { status: 'pass', message: 'fake' },
      globalSkill: { status: 'fail', message: 'skill absent' }, repository: { status: 'fail', message: 'repo absent' }, canInstallSkill: true, canRegisterRepository: true,
    }, ['install-orchestration-skill']);
    const filesystem = new InMemoryFileSystem(root);
    const workflow = new WorkflowProject({ filesystem, inspect: async () => inspection, orca });
    const receipt = await workflow.apply(await workflow.plan({ type: 'init', path: root, profile: 'codex-only' }));
    expect(receipt).toMatchObject({ applied: true, verified: true, externalActions: [{ id: 'install-orchestration-skill', status: 'failed' }] });
    expect(orca.actions).toEqual([{ id: 'install-orchestration-skill', argv: ['skills', 'install', '--skill', 'orchestration'] }]);
    expect(await filesystem.exists(path.join(root, '.agent-orchestration-kit/config.yaml'))).toBe(true);
  });

  it('plans each external action independently as planned or already satisfied', async () => {
    const skillMissing = new MutableOrcaAdapter(orcaDiscovery({
      globalSkill: { status: 'fail', message: 'skill absent' },
    }));
    const skillWorkflow = new WorkflowProject({ filesystem: new InMemoryFileSystem(root), inspect: async () => inspection, orca: skillMissing });
    const skillPlan = await skillWorkflow.plan({ type: 'init', path: root, profile: 'codex-only' });
    expect(skillPlan.globalCommands).toEqual([
      expect.objectContaining({ id: 'install-orchestration-skill', state: 'planned' }),
      expect.objectContaining({ id: 'register-repository', state: 'already-satisfied' }),
    ]);

    const repoMissing = new MutableOrcaAdapter(orcaDiscovery({
      repository: { status: 'fail', message: 'repo absent' },
    }));
    const repoWorkflow = new WorkflowProject({ filesystem: new InMemoryFileSystem(root), inspect: async () => inspection, orca: repoMissing });
    const repoPlan = await repoWorkflow.plan({ type: 'init', path: root, profile: 'codex-only' });
    expect(repoPlan.globalCommands).toEqual([
      expect.objectContaining({ id: 'install-orchestration-skill', state: 'already-satisfied' }),
      expect.objectContaining({ id: 'register-repository', state: 'planned' }),
    ]);
  });

  it('does not execute an action after its observation fails while the other action remains independent', async () => {
    const skillReadFailed = new FakeOrcaAdapter({
      cli: { status: 'pass', message: 'fake' }, compatibility: { status: 'pass', message: 'fake' }, readiness: { status: 'pass', message: 'fake' },
      globalSkill: { status: 'fail', message: 'skills installed command failed' }, repository: { status: 'fail', message: 'repo absent' },
      canInstallSkill: false, canRegisterRepository: true,
    });
    const skillFailedWorkflow = new WorkflowProject({ filesystem: new InMemoryFileSystem(root), inspect: async () => inspection, orca: skillReadFailed });
    const skillFailedPlan = await skillFailedWorkflow.plan({ type: 'init', path: root, profile: 'codex-only' });
    expect(skillFailedPlan.globalCommands.map((action) => action.state)).toEqual(['unavailable', 'planned']);
    await skillFailedWorkflow.apply(skillFailedPlan);
    expect(skillReadFailed.actions).toEqual([{ id: 'register-repository', argv: ['repo', 'add', '--path', root] }]);

    const repositoryReadFailed = new FakeOrcaAdapter({
      cli: { status: 'pass', message: 'fake' }, compatibility: { status: 'pass', message: 'fake' }, readiness: { status: 'pass', message: 'fake' },
      globalSkill: { status: 'fail', message: 'skill absent' }, repository: { status: 'fail', message: 'repo list returned malformed JSON' },
      canInstallSkill: true, canRegisterRepository: false,
    });
    const repositoryFailedWorkflow = new WorkflowProject({ filesystem: new InMemoryFileSystem(root), inspect: async () => inspection, orca: repositoryReadFailed });
    const repositoryFailedPlan = await repositoryFailedWorkflow.plan({ type: 'init', path: root, profile: 'codex-only' });
    expect(repositoryFailedPlan.globalCommands.map((action) => action.state)).toEqual(['planned', 'unavailable']);
    await repositoryFailedWorkflow.apply(repositoryFailedPlan);
    expect(repositoryReadFailed.actions).toEqual([{ id: 'install-orchestration-skill', argv: ['skills', 'install', '--skill', 'orchestration'] }]);
  });

  it('marks both actions unavailable only when core Orca compatibility or readiness fails', async () => {
    const orca = new MutableOrcaAdapter(orcaDiscovery({
      compatibility: { status: 'fail', message: 'outdated' },
      readiness: { status: 'skip', message: 'not checked' },
      globalSkill: { status: 'skip', message: 'not checked' },
      repository: { status: 'skip', message: 'not checked' },
      canInstallSkill: false,
      canRegisterRepository: false,
    }));
    const workflow = new WorkflowProject({ filesystem: new InMemoryFileSystem(root), inspect: async () => inspection, orca });
    const plan = await workflow.plan({ type: 'init', path: root, profile: 'codex-only' });
    expect(plan.globalCommands.every((action) => action.state === 'unavailable')).toBe(true);
    const suppressed = await workflow.plan({ type: 'init', path: root, profile: 'codex-only', global: false, orcaRegistration: false });
    expect(suppressed.globalCommands.every((action) => action.state === 'suppressed')).toBe(true);
  });

  it('supports each disable flag independently and together', async () => {
    const orca = new MutableOrcaAdapter(orcaDiscovery({
      globalSkill: { status: 'fail', message: 'skill absent' },
      repository: { status: 'fail', message: 'repo absent' },
    }));
    const workflow = new WorkflowProject({ filesystem: new InMemoryFileSystem(root), inspect: async () => inspection, orca });
    const noGlobal = await workflow.plan({ type: 'init', path: root, profile: 'codex-only', global: false });
    expect(noGlobal.globalCommands.map((action) => action.state)).toEqual(['suppressed', 'planned']);
    const noRegistration = await workflow.plan({ type: 'init', path: root, profile: 'codex-only', orcaRegistration: false });
    expect(noRegistration.globalCommands.map((action) => action.state)).toEqual(['planned', 'suppressed']);
    const neither = await workflow.plan({ type: 'init', path: root, profile: 'codex-only', global: false, orcaRegistration: false });
    expect(neither.globalCommands.map((action) => action.state)).toEqual(['suppressed', 'suppressed']);
  });

  it('stops after the first external failure and sanitizes adapter output', async () => {
    const orca = new MutableOrcaAdapter(orcaDiscovery({
      globalSkill: { status: 'fail', message: 'skill absent' },
      repository: { status: 'fail', message: 'repo absent' },
    }), 'install-orchestration-skill');
    const filesystem = new InMemoryFileSystem(root);
    const workflow = new WorkflowProject({ filesystem, inspect: async () => inspection, orca });
    const receipt = await workflow.apply(await workflow.plan({ type: 'init', path: root, profile: 'codex-only' }));
    expect(receipt.externalActions).toEqual([
      { id: 'install-orchestration-skill', status: 'failed', message: 'Orca action install-orchestration-skill failed.' },
    ]);
    expect(orca.actions).toHaveLength(1);
    expect(JSON.stringify(receipt)).not.toContain('secret-sentinel');
    expect(await filesystem.exists(path.join(root, '.agent-orchestration-kit/config.yaml'))).toBe(true);
  });

  it('reports successful external-only application without claiming local changes', async () => {
    const files = Object.fromEntries(
      renderDesiredArtifacts(resolveConfig('codex-only')).map((artifact) => [artifact.path, artifact.content]),
    );
    const orca = new MutableOrcaAdapter(orcaDiscovery({
      globalSkill: { status: 'fail', message: 'skill absent' },
      repository: { status: 'fail', message: 'repo absent' },
    }));
    const filesystem = new InMemoryFileSystem(root, files);
    const workflow = new WorkflowProject({ filesystem, inspect: async () => inspection, orca });
    const receipt = await workflow.apply(await workflow.plan({ type: 'init', path: root, profile: 'codex-only' }));
    expect(receipt).toMatchObject({ applied: false, written: [], verified: true });
    expect(receipt.externalActions).toEqual([
      { id: 'install-orchestration-skill', status: 'executed', message: 'Orca action install-orchestration-skill completed.' },
      { id: 'register-repository', status: 'executed', message: 'Orca action register-repository completed.' },
    ]);
    expect(receipt.reason).toContain('No local files changed');
    expect(receipt.reason).toContain('2');
    expect(receipt.reason).toContain('install-orchestration-skill');
    expect(receipt.reason).toContain('register-repository');
  });

  it('reports failed external-only application and unattempted later action', async () => {
    const files = Object.fromEntries(
      renderDesiredArtifacts(resolveConfig('codex-only')).map((artifact) => [artifact.path, artifact.content]),
    );
    const orca = new MutableOrcaAdapter(orcaDiscovery({
      globalSkill: { status: 'fail', message: 'skill absent' },
      repository: { status: 'fail', message: 'repo absent' },
    }), 'install-orchestration-skill');
    const filesystem = new InMemoryFileSystem(root, files);
    const workflow = new WorkflowProject({ filesystem, inspect: async () => inspection, orca });
    const receipt = await workflow.apply(await workflow.plan({ type: 'init', path: root, profile: 'codex-only' }));
    expect(receipt).toMatchObject({ applied: false, written: [], verified: true });
    expect(receipt.externalActions).toEqual([
      { id: 'install-orchestration-skill', status: 'failed', message: 'Orca action install-orchestration-skill failed.' },
    ]);
    expect(receipt.reason).toContain('No local files changed');
    expect(receipt.reason).toContain('install-orchestration-skill failed');
    expect(receipt.reason).toContain('register-repository was not attempted');
    expect(orca.actions).toHaveLength(1);
  });

  it('plans linked-worktree registration against the canonical main repository root', async () => {
    const temporary = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-worktree-plan-'));
    const mainRoot = path.join(temporary, 'main');
    const worktreeRoot = path.join(temporary, 'worktree');
    try {
      await mkdir(path.join(mainRoot, '.git', 'worktrees', 'linked'), { recursive: true });
      await mkdir(worktreeRoot, { recursive: true });
      await writeFile(path.join(worktreeRoot, '.git'), `gitdir: ${path.join(mainRoot, '.git', 'worktrees', 'linked')}\n`);
      const nodeInspection: RepositoryInspection = {
        ...inspection,
        root: worktreeRoot,
        gitDirectory: path.join(mainRoot, '.git', 'worktrees', 'linked'),
      };
      const orca = new NodeOrcaAdapter({
        executable: path.resolve('test/fixtures/orca'),
        env: { ...process.env, AOK_ORCA_SKILLS: 'installed', AOK_ORCA_REPOS: 'none', AOK_ORCA_REPO: worktreeRoot },
      });
      const workflow = new WorkflowProject({
        filesystem: new NodeFileSystem(),
        inspect: async () => nodeInspection,
        orca,
      });
      const plan = await workflow.plan({ type: 'init', path: worktreeRoot, profile: 'codex-only' });
      const registration = plan.globalCommands.find((action) => action.id === 'register-repository');
      const canonicalMainRoot = await realpath(mainRoot);
      expect(registration).toMatchObject({
        state: 'planned',
        target: canonicalMainRoot,
        argv: ['repo', 'add', '--path', canonicalMainRoot],
      });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('rejects a stale external plan when a read probe changes before apply', async () => {
    const orca = new MutableOrcaAdapter(orcaDiscovery({
      globalSkill: { status: 'fail', message: 'skill absent' },
    }));
    const workflow = new WorkflowProject({ filesystem: new InMemoryFileSystem(root), inspect: async () => inspection, orca });
    const plan = await workflow.plan({ type: 'init', path: root, profile: 'codex-only' });
    orca.discovery = orcaDiscovery();
    await expect(workflow.apply(plan)).rejects.toThrow('ChangePlan is stale; repository state changed after planning.');
    expect(orca.actions).toEqual([]);
  });

  it('never executes a forged or non-planned external action', async () => {
    const orca = new MutableOrcaAdapter(orcaDiscovery({
      globalSkill: { status: 'fail', message: 'skill absent' },
      repository: { status: 'fail', message: 'repo absent' },
    }));
    const filesystem = new InMemoryFileSystem(root);
    const workflow = new WorkflowProject({ filesystem, inspect: async () => inspection, orca });
    const plan = await workflow.plan({ type: 'init', path: root, profile: 'codex-only', global: false });
    const forged = {
      ...plan,
      globalCommands: plan.globalCommands.map((action) => action.id === 'register-repository'
        ? { ...action, argv: ['repo', 'add', '--path', '/secret-sentinel'] }
        : action),
    };
    await expect(workflow.apply(forged)).rejects.toThrow('unsupported Orca action or argv');
    expect(orca.actions).toEqual([]);
  });

  it('uses exactly the four stable Orca Doctor IDs', async () => {
    const { workflow } = createWorkflow();
    const report = await workflow.doctor(root);
    expect(report.checks.map((check) => check.id)).toEqual(expect.arrayContaining([
      'orca-cli', 'orca-readiness', 'orca-global-skill', 'orca-repository-registration',
    ]));
    expect(report.checks.some((check) => check.id === 'orca-cli-compatibility')).toBe(false);
  });

  it('plans a managed-block update without treating an existing AGENTS.md as a collision', async () => {
    const { workflow } = createWorkflow({ 'AGENTS.md': '# User instructions\r\n' });
    const plan = await workflow.plan({ type: 'init', path: root, profile: 'codex-only' });
    expect(plan.files.find((file) => file.path === 'AGENTS.md')?.action).toBe('update');
    expect(plan.blockers.some((blocker) => blocker.path === 'AGENTS.md')).toBe(false);
  });

  it('is a no-op for an identical same-version installation', async () => {
    const files = Object.fromEntries(
      renderDesiredArtifacts(resolveConfig('codex-only')).map((artifact) => [artifact.path, artifact.content]),
    );
    const { workflow } = createWorkflow(files);
    const plan = await workflow.plan({ type: 'init', path: root, profile: 'codex-only' });
    const artifactCount = renderDesiredArtifacts(resolveConfig('codex-only')).length;
    expect(plan.blockers).toEqual([]);
    expect(plan.summary).toEqual({ create: 0, update: 0, unchanged: artifactCount, blocked: 0 });
  });

  it.each(['codex-only', 'claude-coordinator', 'claude-only', 'codex-coordinator'] as const)(
    'applies and verifies the complete %s profile, then no-ops',
    async (profile) => {
      const { filesystem, workflow } = createWorkflow();
      const firstPlan = await workflow.plan({ type: 'init', path: root, profile });
      expect(firstPlan.canApply).toBe(true);
      const firstReceipt = await workflow.apply(firstPlan);
      expect(firstReceipt).toMatchObject({ applied: true, verified: true });

      const secondPlan = await workflow.plan({ type: 'init', path: root, profile });
      expect(secondPlan.blockers).toEqual([]);
      expect(secondPlan.files.every((file) => file.action === 'unchanged')).toBe(true);
      const secondReceipt = await workflow.apply(secondPlan);
      expect(secondReceipt).toMatchObject({ applied: false, verified: true, written: [] });

      const claudeArtifacts = Object.keys(filesystem.snapshot()).filter((filePath) =>
        filePath.includes('/.claude/skills/') || filePath.endsWith('/CLAUDE.md'));
      expect(claudeArtifacts).toHaveLength(profile === 'codex-only' ? 0 : skillBundleCatalog.skills.length + 1);
    },
  );

  it('probes Claude only when the installed profile requires it', async () => {
    const codexHarness = new FakeHarnessAdapter();
    const codexOrca = new FakeOrcaAdapter(orcaDiscovery());
    const codexWorkflow = new WorkflowProject({
      filesystem: createWorkflow().filesystem,
      inspect: async () => inspection,
      harness: codexHarness,
      orca: codexOrca,
    });
    await codexWorkflow.apply(await codexWorkflow.plan({ type: 'init', path: root, profile: 'codex-only' }));
    const codexReport = await codexWorkflow.doctor(root);
    expect(codexHarness.calls).toEqual([]);
    expect(codexOrca.actions).toEqual([]);
    expect(codexReport.checks).toContainEqual(expect.objectContaining({
      id: 'claude-compatibility',
      status: 'SKIP',
    }));

    const claudeHarness = new FakeHarnessAdapter();
    const claudeOrca = new FakeOrcaAdapter(orcaDiscovery());
    const claudeWorkflow = new WorkflowProject({
      filesystem: createWorkflow().filesystem,
      inspect: async () => inspection,
      harness: claudeHarness,
      orca: claudeOrca,
    });
    await claudeWorkflow.apply(await claudeWorkflow.plan({ type: 'init', path: root, profile: 'claude-coordinator' }));
    const claudeReport = await claudeWorkflow.doctor(root);
    expect(claudeHarness.calls).toEqual(['claude']);
    expect(claudeOrca.actions).toEqual([]);
    expect(claudeReport.checks).toContainEqual(expect.objectContaining({ id: 'claude-cli', status: 'PASS' }));
    expect(claudeReport.checks).toContainEqual(expect.objectContaining({ id: 'claude-version', status: 'PASS' }));
    expect(claudeReport.checks).toContainEqual(expect.objectContaining({ id: 'claude-auth', status: 'PASS' }));
  });

  it.each([
    ['missing', 'missing'],
    ['outdated', 'outdated'],
    ['unauthenticated', 'unauthenticated'],
    ['malformed', 'malformed'],
    ['command failure', 'command-failure'],
  ] as const)('Doctor preserves actionable Claude failure reason: %s', async (_label, reason) => {
    const cli: ClaudeHarnessReport['cli'] = reason === 'missing'
      ? { status: 'fail', reason: 'missing', message: 'safe CLI result' }
      : { status: 'pass', message: 'safe CLI result' };
    const report: ClaudeHarnessReport = {
      harness: 'claude',
      cli,
      version: { status: 'fail', reason, message: 'safe version result' },
      authentication: { status: 'skip', reason: 'not-checked', message: 'safe auth result' },
    };
    const harness = new FakeHarnessAdapter({ report });
    const { filesystem } = createWorkflow();
    const orca = new FakeOrcaAdapter(orcaDiscovery());
    const workflow = new WorkflowProject({ filesystem, inspect: async () => inspection, harness, orca });
    await workflow.apply(await workflow.plan({ type: 'init', path: root, profile: 'claude-only' }));
    const doctor = await workflow.doctor(root);
    expect(orca.actions).toEqual([]);
    expect(doctor.healthy).toBe(false);
    expect(doctor.checks).toContainEqual(expect.objectContaining({
      id: 'claude-version',
      status: 'FAIL',
      message: 'safe version result',
    }));
  });

  it.each(['codex-only', 'claude-coordinator', 'claude-only', 'codex-coordinator'] as const)(
    'Doctor validates the installed %s profile and its local artifacts',
    async (profile) => {
      const { workflow } = createWorkflow();
      await workflow.apply(await workflow.plan({ type: 'init', path: root, profile }));
      const report = await workflow.doctor(root);
      expect(report.healthy).toBe(true);
      expect(report.checks).toContainEqual(expect.objectContaining({ id: 'config-contract', status: 'PASS' }));
      expect(report.checks).toContainEqual(expect.objectContaining({
        id: 'claude-discovery',
        status: profile === 'codex-only' ? 'SKIP' : 'PASS',
      }));
      expect(report.checks).toContainEqual(expect.objectContaining({
        id: 'routing-local',
        status: profile === 'claude-only' || profile === 'codex-coordinator' ? 'WARN' : 'PASS',
      }));
    },
  );

  it('Doctor reports Claude artifact drift even when the rest of the installation is intact', async () => {
    const { filesystem, workflow } = createWorkflow();
    await workflow.apply(await workflow.plan({ type: 'init', path: root, profile: 'claude-coordinator' }));
    filesystem.seed(path.join(root, '.claude/skills/tdd/SKILL.md'), 'user drift\n');
    const report = await workflow.doctor(root);
    expect(report.healthy).toBe(false);
    expect(report.checks).toContainEqual(expect.objectContaining({ id: 'claude-discovery', status: 'FAIL' }));
    expect(report.checks).toContainEqual(expect.objectContaining({ id: 'drift', status: 'FAIL' }));
  });

  it('Doctor reports a missing Campaign artifact through the catalog-derived skills check', async () => {
    const files = Object.fromEntries(
      renderDesiredArtifacts(resolveConfig('codex-only')).map((artifact) => [artifact.path, artifact.content]),
    );
    delete files['.agents/skills/campaign/SKILL.md'];
    const { workflow } = createWorkflow(files);
    const report = await workflow.doctor(root);
    expect(report.healthy).toBe(false);
    expect(report.checks).toContainEqual(expect.objectContaining({
      id: 'skills',
      status: 'FAIL',
      message: expect.stringContaining('campaign/SKILL.md'),
    }));
  });

  it('Doctor validates catalog-declared Campaign references and excludes it from attribution', async () => {
    const { workflow } = createWorkflow();
    await workflow.apply(await workflow.plan({ type: 'init', path: root, profile: 'codex-only' }));
    const report = await workflow.doctor(root);
    expect(report.checks).toContainEqual(expect.objectContaining({ id: 'skills', status: 'PASS' }));
    expect(report.checks).toContainEqual(expect.objectContaining({ id: 'attribution', status: 'PASS' }));
  });

  it('reports local drift and never plans to overwrite it', async () => {
    const files = Object.fromEntries(
      renderDesiredArtifacts(resolveConfig('codex-only')).map((artifact) => [artifact.path, artifact.content]),
    );
    files['.agent-orchestration-kit/config.yaml'] = `${files['.agent-orchestration-kit/config.yaml']}# user edit\n`;
    const { workflow } = createWorkflow(files);
    const plan = await workflow.plan({ type: 'init', path: root, profile: 'codex-only' });
    expect(plan.blockers.some((blocker) => blocker.code === 'drift' && blocker.path === '.agent-orchestration-kit/config.yaml')).toBe(true);
    expect(plan.blockers.filter((blocker) => blocker.code === 'drift' && blocker.path === '.agent-orchestration-kit/config.yaml')).toHaveLength(1);
    expect(plan.files.find((file) => file.path === '.agent-orchestration-kit/config.yaml')?.action).toBe('unchanged');
  });

  it('reports an invalid manifest as non-clean diff', async () => {
    const { workflow } = createWorkflow({ '.agent-orchestration-kit/manifest.json': '{broken' });
    const report = await workflow.diff(root);
    expect(report.clean).toBe(false);
    expect(report.items).toContainEqual(expect.objectContaining({
      path: '.agent-orchestration-kit/manifest.json',
      status: 'invalid-manifest',
    }));
  });

  it('blocks an existing artifact symlink that resolves outside the repository', async () => {
    class RedirectingFileSystem extends InMemoryFileSystem {
      public override async realpath(filePath: string): Promise<string> {
        if (this.resolve(filePath) === path.join(root, 'docs/agents/domain.md')) {
          return path.resolve('/outside/domain.md');
        }
        return super.realpath(filePath);
      }
    }

    const filesystem = new RedirectingFileSystem(root, { 'docs/agents/domain.md': '# outside\n' });
    const orca = new FakeOrcaAdapter(orcaDiscovery());
    const workflow = new WorkflowProject({ filesystem, inspect: async () => inspection, orca });
    const plan = await workflow.plan({ type: 'init', path: root, profile: 'codex-only' });
    expect(orca.actions).toEqual([]);
    expect(plan.blockers).toContainEqual(expect.objectContaining({
      code: 'unsafe-path',
      path: 'docs/agents/domain.md',
    }));
  });

  it('blocks a dangling artifact symlink instead of planning a create through it', async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-symlink-'));
    try {
      await mkdir(path.join(temporaryRoot, 'docs/agents'), { recursive: true });
      await symlink(path.join(temporaryRoot, '..', 'missing-outside'), path.join(temporaryRoot, 'docs/agents/domain.md'));
      const nodeInspection: RepositoryInspection = {
        ...inspection,
        root: temporaryRoot,
        gitDirectory: path.join(temporaryRoot, '.git'),
      };
      const workflow = new WorkflowProject({
        filesystem: new NodeFileSystem(),
        inspect: async () => nodeInspection,
        orca: new FakeOrcaAdapter(orcaDiscovery()),
      });
      const plan = await workflow.plan({ type: 'init', path: temporaryRoot, profile: 'codex-only' });
      expect(plan.blockers).toContainEqual(expect.objectContaining({
        code: 'unsafe-path',
        path: 'docs/agents/domain.md',
      }));
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('reports incompatible parent-file and target-directory shapes as collisions', async () => {
    const parentFileRoot = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-parent-file-'));
    const targetDirectoryRoot = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-target-directory-'));
    try {
      await writeFile(path.join(parentFileRoot, '.agent-orchestration-kit'), 'user file\n');
      await mkdir(path.join(targetDirectoryRoot, 'docs/agents/domain.md'), { recursive: true });

      for (const candidateRoot of [parentFileRoot, targetDirectoryRoot]) {
        const nodeInspection: RepositoryInspection = {
          ...inspection,
          root: candidateRoot,
          gitDirectory: path.join(candidateRoot, '.git'),
        };
        const workflow = new WorkflowProject({
          filesystem: new NodeFileSystem(),
          inspect: async () => nodeInspection,
          orca: new FakeOrcaAdapter(orcaDiscovery()),
        });
        const plan = await workflow.plan({ type: 'init', path: candidateRoot, profile: 'codex-only' });
        expect(plan.blockers.some((blocker) => blocker.code === 'collision')).toBe(true);
      }
    } finally {
      await Promise.all([
        rm(parentFileRoot, { recursive: true, force: true }),
        rm(targetDirectoryRoot, { recursive: true, force: true }),
      ]);
    }
  });

  it('reports a user-authored generated-file collision on first install', async () => {
    const { workflow } = createWorkflow({ 'docs/agents/domain.md': '# Mine\n' });
    const plan = await workflow.plan({ type: 'init', path: root, profile: 'codex-only' });
    expect(plan.blockers).toContainEqual(expect.objectContaining({
      code: 'collision',
      path: 'docs/agents/domain.md',
    }));
  });

  it('refuses an existing unmanaged Claude skill directory', async () => {
    const { workflow } = createWorkflow({ '.claude/skills/tdd/README.md': 'User-owned skill\n' });
    const plan = await workflow.plan({ type: 'init', path: root, profile: 'claude-only' });
    expect(plan.blockers).toContainEqual(expect.objectContaining({
      code: 'collision',
      path: '.claude/skills/tdd/SKILL.md',
    }));
    expect(plan.files.find((file) => file.path === '.claude/skills/tdd/SKILL.md')?.action).toBe('unchanged');
  });

  it('reports a byte-identical unmanaged CLAUDE.md as a collision', async () => {
    const desired = renderDesiredArtifacts(resolveConfig('claude-only'))
      .find((artifact) => artifact.path === 'CLAUDE.md')?.content;
    expect(desired).toBeDefined();
    const { workflow } = createWorkflow({ 'CLAUDE.md': desired! });
    const plan = await workflow.plan({ type: 'init', path: root, profile: 'claude-only' });
    expect(plan.blockers).toContainEqual(expect.objectContaining({
      code: 'collision',
      path: 'CLAUDE.md',
    }));
    expect(plan.files.find((file) => file.path === 'CLAUDE.md')).toMatchObject({
      action: 'unchanged',
      reason: 'Existing content is preserved.',
    });
  });

  it('applies once, preserves user AGENTS.md bytes, and is idempotent', async () => {
    const userInstructions = '# User instructions\r\nKeep this exact.\r\n';
    const { filesystem, workflow } = createWorkflow({ 'AGENTS.md': userInstructions });
    const firstPlan = await workflow.plan({ type: 'init', path: root, profile: 'codex-only' });
    const receipt = await workflow.apply(firstPlan);
    expect(receipt.applied).toBe(true);
    expect(receipt.verified).toBe(true);
    expect((await filesystem.readFile(path.join(root, 'AGENTS.md'))).startsWith(userInstructions)).toBe(true);

    const secondPlan = await workflow.plan({ type: 'init', path: root, profile: 'codex-only' });
    expect(secondPlan.files.every((file) => file.action === 'unchanged')).toBe(true);
    const secondReceipt = await workflow.apply(secondPlan);
    expect(secondReceipt.applied).toBe(false);
    expect(secondReceipt.written).toEqual([]);
  });

  it('detects a config and managed block forged together with matching manifest hashes', async () => {
    const { filesystem, workflow } = createWorkflow();
    await workflow.apply(await workflow.plan({ type: 'init', path: root, profile: 'codex-only' }));

    const configPath = path.join(root, '.agent-orchestration-kit/config.yaml');
    const agentsPath = path.join(root, 'AGENTS.md');
    const manifestPath = path.join(root, '.agent-orchestration-kit/manifest.json');
    const forgedConfig = (await filesystem.readFile(configPath)).replace(
      'maxImplementationWorkers: 3',
      'maxImplementationWorkers: 4',
    );
    const forgedAgents = (await filesystem.readFile(agentsPath)).replace(
      'Maximum active implementation workers: 3.',
      'Maximum active implementation workers: 4.',
    );
    const manifest = JSON.parse(await filesystem.readFile(manifestPath)) as {
      files: { path: string; hash: string }[];
    };
    const configEntry = manifest.files.find((entry) => entry.path === '.agent-orchestration-kit/config.yaml');
    const agentsEntry = manifest.files.find((entry) => entry.path === 'AGENTS.md');
    const forgedBlock = inspectManagedBlock(forgedAgents);
    expect(configEntry).toBeDefined();
    expect(agentsEntry).toBeDefined();
    expect(forgedBlock.status).toBe('valid');
    configEntry!.hash = sha256(forgedConfig);
    agentsEntry!.hash = sha256(forgedBlock.content!);
    filesystem.seed(configPath, forgedConfig);
    filesystem.seed(agentsPath, forgedAgents);
    filesystem.seed(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    expect((await workflow.diff(root)).clean).toBe(true);
    const report = await workflow.doctor(root);
    expect(report.healthy).toBe(false);
    expect(report.checks).toContainEqual(expect.objectContaining({ id: 'config-contract', status: 'FAIL' }));
    expect(report.checks).toContainEqual(expect.objectContaining({ id: 'manifest-contract', status: 'FAIL' }));
  });

  it('refuses a profile transition instead of overwriting the installed contract', async () => {
    const { filesystem, workflow } = createWorkflow();
    await workflow.apply(await workflow.plan({ type: 'init', path: root, profile: 'codex-only' }));
    const before = filesystem.snapshot();
    const plan = await workflow.plan({ type: 'init', path: root, profile: 'claude-only' });
    expect(plan.canApply).toBe(false);
    expect(plan.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'drift', path: '.agent-orchestration-kit/config.yaml' }),
      expect.objectContaining({ code: 'drift', path: 'AGENTS.md' }),
      expect.objectContaining({ code: 'drift', path: '.agent-orchestration-kit/manifest.json' }),
    ]));
    expect(filesystem.snapshot()).toEqual(before);
  });
});
