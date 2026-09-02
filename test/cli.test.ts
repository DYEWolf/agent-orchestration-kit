import { execa } from 'execa';
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { InMemoryFileSystem } from '../src/adapters/filesystem/in-memory-filesystem.js';
import { FakeOrcaAdapter } from '../src/adapters/orca/fake-orca.js';
import { FakeGitHubAdapter } from '../src/adapters/github/fake-github.js';
import { WorkflowProject } from '../src/workflow-project/workflow-project.js';
import { createProgram } from '../src/cli.js';

describe('CLI error contract', () => {
  it('emits parse-time errors as JSON when --json is requested', async () => {
    const result = await execa('node', ['--import', 'tsx', 'src/cli.ts', 'init', '--unknown', '--json'], {
      reject: false,
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({
      error: { message: "error: unknown option '--unknown'" },
    });
  });

  it('documents that --yes accepts the complete enumerated plan, including Orca and GitHub actions', async () => {
    const result = await execa('node', ['--import', 'tsx', 'src/cli.ts', 'init', '--help'], {
      reject: false,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/--yes[\s\S]*including its enumerated Orca actions and GitHub\s+actions/u);
    expect(result.stdout).toContain('--no-github-mutations');
    expect(result.stdout).not.toContain('enumerated local mutations');
  });

  it('cancels from the actual confirmation branch without local, Orca, or GitHub writes', async () => {
    const root = path.resolve('/fixture/cli-confirmation');
    const filesystem = new InMemoryFileSystem(root);
    const orca = new FakeOrcaAdapter({
      cli: { status: 'pass', message: 'fake' },
      compatibility: { status: 'pass', message: 'fake' },
      readiness: { status: 'pass', message: 'fake' },
      globalSkill: { status: 'fail', message: 'skill absent' },
      repository: { status: 'fail', message: 'repository absent' },
      canInstallSkill: true,
      canRegisterRepository: true,
    });
    const github = new FakeGitHubAdapter({
      cli: { status: 'pass', message: 'fake' },
      auth: { status: 'pass', message: 'fake' },
      repository: { status: 'pass', message: 'fake' },
      repositoryNodeId: 'R_cli_confirmation',
      repositoryNameWithOwner: 'DYEWolf/cli-confirmation',
      label: { status: 'fail', message: 'label missing' },
      labelState: 'missing',
      canCreateLabel: true,
    });
    const workflow = new WorkflowProject({
      filesystem,
      inspect: async () => ({
        root,
        gitDirectory: path.join(root, '.git'),
        github: {
          host: 'github.com', owner: 'DYEWolf', name: 'cli-confirmation',
          remoteName: 'origin', display: 'github.com/DYEWolf/cli-confirmation',
        },
      }),
      orca,
      github,
    });
    let confirmationCalls = 0;
    const program = createProgram({
      createWorkflow: () => workflow,
      confirm: async () => { confirmationCalls += 1; return false; },
    });
    await program.parseAsync(['node', 'test', 'init', root, '--profile', 'codex-only']);

    expect(confirmationCalls).toBe(1);
    expect(filesystem.snapshot()).toEqual({});
    expect(orca.actions).toEqual([]);
    expect(github.actions).toEqual([]);
  });
});
