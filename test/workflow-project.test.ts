import path from 'node:path';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { InMemoryFileSystem } from '../src/adapters/filesystem/in-memory-filesystem.js';
import { NodeFileSystem } from '../src/adapters/filesystem/node-filesystem.js';
import { renderDesiredArtifacts } from '../src/artifacts/render.js';
import { resolveConfig } from '../src/config/profiles.js';
import type { RepositoryInspection } from '../src/repository/inspection.js';
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
    expect(second).toEqual(first);
    expect(filesystem.snapshot()).toEqual(before);
    expect(first.summary).toEqual({ create: 8, update: 0, unchanged: 0, blocked: 0 });
    expect(first.canApply).toBe(false);
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
    expect(plan.blockers).toEqual([]);
    expect(plan.summary).toEqual({ create: 0, update: 0, unchanged: 8, blocked: 0 });
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
});
