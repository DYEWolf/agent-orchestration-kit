import path from 'node:path';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { InMemoryFileSystem } from '../src/adapters/filesystem/in-memory-filesystem.js';
import { NodeFileSystem } from '../src/adapters/filesystem/node-filesystem.js';
import { FakeHarnessAdapter } from '../src/adapters/harness/fake-harness.js';
import type { ClaudeHarnessReport } from '../src/adapters/harness/harness.js';
import { renderDesiredArtifacts } from '../src/artifacts/render.js';
import { skillBundleCatalog } from '../src/artifacts/skill-bundle.js';
import { inspectManagedBlock } from '../src/artifacts/managed-block.js';
import { resolveConfig } from '../src/config/profiles.js';
import type { RepositoryInspection } from '../src/repository/inspection.js';
import { sha256 } from '../src/shared/hash.js';
import { WorkflowProject } from '../src/workflow-project/workflow-project.js';

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
  });
  return { filesystem, workflow };
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
    const codexWorkflow = new WorkflowProject({
      filesystem: createWorkflow().filesystem,
      inspect: async () => inspection,
      harness: codexHarness,
    });
    await codexWorkflow.apply(await codexWorkflow.plan({ type: 'init', path: root, profile: 'codex-only' }));
    const codexReport = await codexWorkflow.doctor(root);
    expect(codexHarness.calls).toEqual([]);
    expect(codexReport.checks).toContainEqual(expect.objectContaining({
      id: 'claude-compatibility',
      status: 'SKIP',
    }));

    const claudeHarness = new FakeHarnessAdapter();
    const claudeWorkflow = new WorkflowProject({
      filesystem: createWorkflow().filesystem,
      inspect: async () => inspection,
      harness: claudeHarness,
    });
    await claudeWorkflow.apply(await claudeWorkflow.plan({ type: 'init', path: root, profile: 'claude-coordinator' }));
    const claudeReport = await claudeWorkflow.doctor(root);
    expect(claudeHarness.calls).toEqual(['claude']);
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
    const workflow = new WorkflowProject({ filesystem, inspect: async () => inspection, harness });
    await workflow.apply(await workflow.plan({ type: 'init', path: root, profile: 'claude-only' }));
    const doctor = await workflow.doctor(root);
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
    files['.orca-kit/config.yaml'] = `${files['.orca-kit/config.yaml']}# user edit\n`;
    const { workflow } = createWorkflow(files);
    const plan = await workflow.plan({ type: 'init', path: root, profile: 'codex-only' });
    expect(plan.blockers.some((blocker) => blocker.code === 'drift' && blocker.path === '.orca-kit/config.yaml')).toBe(true);
    expect(plan.blockers.filter((blocker) => blocker.code === 'drift' && blocker.path === '.orca-kit/config.yaml')).toHaveLength(1);
    expect(plan.files.find((file) => file.path === '.orca-kit/config.yaml')?.action).toBe('unchanged');
  });

  it('reports an invalid manifest as non-clean diff', async () => {
    const { workflow } = createWorkflow({ '.orca-kit/manifest.json': '{broken' });
    const report = await workflow.diff(root);
    expect(report.clean).toBe(false);
    expect(report.items).toContainEqual(expect.objectContaining({
      path: '.orca-kit/manifest.json',
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
    const workflow = new WorkflowProject({ filesystem, inspect: async () => inspection });
    const plan = await workflow.plan({ type: 'init', path: root, profile: 'codex-only' });
    expect(plan.blockers).toContainEqual(expect.objectContaining({
      code: 'unsafe-path',
      path: 'docs/agents/domain.md',
    }));
  });

  it('blocks a dangling artifact symlink instead of planning a create through it', async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'orca-kit-symlink-'));
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
    const parentFileRoot = await mkdtemp(path.join(tmpdir(), 'orca-kit-parent-file-'));
    const targetDirectoryRoot = await mkdtemp(path.join(tmpdir(), 'orca-kit-target-directory-'));
    try {
      await writeFile(path.join(parentFileRoot, '.orca-kit'), 'user file\n');
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

    const configPath = path.join(root, '.orca-kit/config.yaml');
    const agentsPath = path.join(root, 'AGENTS.md');
    const manifestPath = path.join(root, '.orca-kit/manifest.json');
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
    const configEntry = manifest.files.find((entry) => entry.path === '.orca-kit/config.yaml');
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
      expect.objectContaining({ code: 'drift', path: '.orca-kit/config.yaml' }),
      expect.objectContaining({ code: 'drift', path: 'AGENTS.md' }),
      expect.objectContaining({ code: 'drift', path: '.orca-kit/manifest.json' }),
    ]));
    expect(filesystem.snapshot()).toEqual(before);
  });
});
