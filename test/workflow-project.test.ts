import path from 'node:path';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { InMemoryFileSystem } from '../src/adapters/filesystem/in-memory-filesystem.js';
import { NodeFileSystem } from '../src/adapters/filesystem/node-filesystem.js';
import { renderDesiredArtifacts } from '../src/artifacts/render.js';
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

function createWorkflow(files: Readonly<Record<string, string>> = {}) {
  const filesystem = new InMemoryFileSystem(root, files);
  const workflow = new WorkflowProject({
    filesystem,
    inspect: async () => inspection,
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

  it('detects a self-consistent swap to a profile Phase 2 cannot install', async () => {
    const { filesystem, workflow } = createWorkflow();
    await workflow.apply(await workflow.plan({ type: 'init', path: root, profile: 'codex-only' }));
    const claudeArtifacts = new Map(
      renderDesiredArtifacts(resolveConfig('claude-only')).map((artifact) => [artifact.path, artifact.content]),
    );
    for (const artifactPath of ['.orca-kit/config.yaml', '.orca-kit/manifest.json', 'AGENTS.md']) {
      filesystem.seed(path.join(root, artifactPath), claudeArtifacts.get(artifactPath)!);
    }

    expect((await workflow.diff(root)).clean).toBe(true);
    const report = await workflow.doctor(root);
    expect(report.healthy).toBe(false);
    expect(report.checks).toContainEqual(expect.objectContaining({ id: 'config-contract', status: 'FAIL' }));
    expect(report.checks).toContainEqual(expect.objectContaining({ id: 'manifest-contract', status: 'FAIL' }));
  });
});
