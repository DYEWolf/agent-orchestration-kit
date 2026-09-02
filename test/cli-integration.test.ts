import path from 'node:path';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

const cliArguments = ['--import', 'tsx', 'src/cli.ts'];

describe('local CLI installation lifecycle', () => {
  it('dry-runs, applies, verifies, no-ops, and refuses drift', async () => {
    const repository = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-cli-integration-'));
    try {
      await execa('git', ['-C', repository, 'init', '--quiet', '-b', 'main']);
      await execa('git', ['-C', repository, 'remote', 'add', 'origin', 'git@github.com:DYEWolf/fixture.git']);

      const dryRun = await runCli(['init', repository, '--profile', 'codex-only', '--dry-run', '--json']);
      const dryPlan = JSON.parse(dryRun.stdout) as { canApply: boolean; summary: { create: number } };
      expect(dryPlan.canApply).toBe(true);
      expect(dryPlan.summary.create).toBeGreaterThan(60);

      const first = await runCli(['init', repository, '--profile', 'codex-only', '--yes', '--json']);
      const firstResult = JSON.parse(first.stdout) as { receipt: { applied: boolean; verified: boolean; written: string[] } };
      expect(firstResult.receipt.applied).toBe(true);
      expect(firstResult.receipt.verified).toBe(true);
      expect(firstResult.receipt.written.length).toBe(dryPlan.summary.create);

      const second = await runCli(['init', repository, '--profile', 'codex-only', '--yes', '--json']);
      const secondResult = JSON.parse(second.stdout) as { receipt: { applied: boolean; written: string[] } };
      expect(secondResult.receipt.applied).toBe(false);
      expect(secondResult.receipt.written).toEqual([]);

      const doctor = JSON.parse((await runCli(['doctor', repository, '--json'])).stdout) as { healthy: boolean; summary: { FAIL: number } };
      expect(doctor.healthy).toBe(true);
      expect(doctor.summary.FAIL).toBe(0);
      const cleanDiff = JSON.parse((await runCli(['diff', repository, '--json'])).stdout) as { clean: boolean };
      expect(cleanDiff.clean).toBe(true);

      const skillPath = path.join(repository, '.agents/skills/tdd/SKILL.md');
      const original = await readFile(skillPath, 'utf8');
      await writeFile(skillPath, `${original}\nuser drift\n`, 'utf8');
      const drift = await runCli(['diff', repository, '--json'], false);
      expect(drift.exitCode).toBe(2);
      expect((JSON.parse(drift.stdout) as { clean: boolean }).clean).toBe(false);
      const blockedInit = await runCli(['init', repository, '--profile', 'codex-only', '--yes', '--json'], false);
      expect(blockedInit.exitCode).toBe(2);
      expect(await readFile(skillPath, 'utf8')).toBe(`${original}\nuser drift\n`);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  }, 20_000);

  it('suppresses GitHub mutations independently, then creates one authoritative missing label', async () => {
    const repository = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-cli-github-missing-'));
    const state = path.join(repository, 'fake-gh-state');
    const log = path.join(repository, 'fake-gh-log');
    try {
      await execa('git', ['-C', repository, 'init', '--quiet', '-b', 'main']);
      await execa('git', ['-C', repository, 'remote', 'add', 'origin', 'git@github.com:DYEWolf/github-missing.git']);
      await writeFile(log, '');
      const environment = {
        AOK_GH_MODE: 'label-missing',
        AOK_GH_STATE: state,
        AOK_GH_LOG: log,
        AOK_ORCA_SKILLS: 'installed',
        AOK_ORCA_REPOS: 'present',
      };
      const suppressed = JSON.parse((await runCli([
        'init', repository, '--profile', 'codex-only', '--yes', '--json', '--no-github-mutations', '--no-global', '--no-orca-registration',
      ], true, environment)).stdout) as {
        plan: { githubLabelMutations: { state: string }[] };
        receipt: { githubActions: unknown[] };
      };
      expect(suppressed.plan.githubLabelMutations).toEqual([expect.objectContaining({ state: 'suppressed' })]);
      expect(suppressed.receipt.githubActions).toEqual([]);
      await expect(readFile(state, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

      const created = JSON.parse((await runCli([
        'init', repository, '--profile', 'codex-only', '--yes', '--json', '--no-global', '--no-orca-registration',
      ], true, environment)).stdout) as {
        receipt: { githubActions: { id: string; status: string; message: string }[]; verified: boolean };
      };
      expect(created.receipt).toMatchObject({ verified: true });
      expect(created.receipt.githubActions).toEqual([{
        id: 'create-ready-for-agent-label', status: 'executed', message: expect.any(String),
      }]);
      expect(await readFile(state, 'utf8')).toBe('created\n');
      const calls = (await readFile(log, 'utf8')).trim().split('\n');
      expect(calls.filter((line) => line === 'create')).toHaveLength(1);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  }, 20_000);

  it('reports a GitHub create failure with a sanitized receipt and preserves local files', async () => {
    const repository = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-cli-github-failure-'));
    const state = path.join(repository, 'fake-gh-state');
    const log = path.join(repository, 'fake-gh-log');
    try {
      await execa('git', ['-C', repository, 'init', '--quiet', '-b', 'main']);
      await execa('git', ['-C', repository, 'remote', 'add', 'origin', 'git@github.com:DYEWolf/github-failure.git']);
      await writeFile(log, '');
      const result = await runCli(['init', repository, '--profile', 'codex-only', '--yes', '--json', '--no-global', '--no-orca-registration'], false, {
        AOK_GH_MODE: 'missing-create-fail', AOK_GH_STATE: state, AOK_GH_LOG: log,
        AOK_GH_SENTINEL: '1',
        AOK_ORCA_SKILLS: 'installed', AOK_ORCA_REPOS: 'present',
      });
      expect(result.exitCode).toBe(2);
      const payload = JSON.parse(result.stdout) as {
        receipt: { applied: boolean; verified: boolean; githubActions: { status: string; message: string }[] };
      };
      expect(payload.receipt).toMatchObject({ applied: true, verified: true });
      expect(payload.receipt.githubActions).toEqual([{ id: 'create-ready-for-agent-label', status: 'failed', message: expect.any(String) }]);
      expect(JSON.stringify(payload)).not.toContain('sentinel');
      expect(await readFile(path.join(repository, '.agent-orchestration-kit/config.yaml'), 'utf8')).toContain('schemaVersion: 1');
      await expect(readFile(state, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      expect((await readFile(log, 'utf8')).split('\n').filter((line) => line === 'create')).toHaveLength(1);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  }, 20_000);

  it.each([
    ['repository errors non-array', 'repo-errors-non-array'],
    ['repository errors non-empty', 'repo-errors-array'],
    ['repository non-object top-level value', 'repo-top-level-array'],
    ['repository missing data', 'repo-missing-data'],
    ['repository non-object data', 'repo-data-null'],
    ['repository null', 'repo-null'],
    ['repository missing fields', 'repo-malformed'],
    ['repository wrong field types', 'repo-wrong-types'],
    ['label errors non-array', 'label-errors-non-array'],
    ['label errors non-empty', 'label-errors-array'],
    ['label non-object top-level value', 'label-top-level-array'],
    ['label missing data', 'label-missing-data'],
    ['label non-object data', 'label-data-null'],
    ['label null node', 'label-null-node'],
    ['label unexpected node', 'label-unexpected-node'],
    ['label missing property', 'label-missing-property'],
    ['label malformed object', 'label-malformed'],
    ['label wrong field types', 'label-wrong-types'],
    ['mutation malformed JSON', 'mutation-malformed-json'],
    ['mutation errors non-array', 'mutation-errors-non-array'],
    ['mutation errors non-empty', 'mutation-errors-array'],
    ['mutation non-object top-level value', 'mutation-top-level-array'],
    ['mutation non-object data', 'mutation-data-null'],
    ['mutation null createLabel', 'mutation-null'],
    ['mutation partial label', 'mutation-partial'],
    ['mutation wrong name', 'mutation-wrong-name'],
    ['mutation wrong metadata', 'mutation-wrong-metadata'],
    ['mutation wrong repository ID', 'mutation-wrong-repository-id'],
  ] as const)('rejects untrusted GitHub GraphQL data in the CLI for %s', async (_label, mode) => {
    const repository = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-cli-github-envelope-'));
    const state = path.join(repository, 'fake-gh-state');
    const log = path.join(repository, 'fake-gh-log');
    const mutationResponse = mode.startsWith('mutation-');
    try {
      await execa('git', ['-C', repository, 'init', '--quiet', '-b', 'main']);
      await execa('git', ['-C', repository, 'remote', 'add', 'origin', `git@github.com:DYEWolf/envelope-${mode}.git`]);
      await writeFile(log, '');
      const result = await runCli(['init', repository, '--profile', 'codex-only', '--yes', '--json', '--no-global', '--no-orca-registration'], false, {
        AOK_GH_MODE: mode,
        AOK_GH_STATE: state,
        AOK_GH_LOG: log,
        AOK_GH_SENTINEL: '1',
        AOK_ORCA_SKILLS: 'installed',
        AOK_ORCA_REPOS: 'present',
      });
      expect(result.exitCode).toBe(2);
      const payload = JSON.parse(result.stdout) as {
        blockers?: unknown[];
        plan?: { blockers: unknown[] };
        receipt?: { applied: boolean; verified: boolean; githubActions: { id: string; status: string }[] };
      };
      expect(JSON.stringify(payload)).not.toContain('secret-sentinel');
      if (mutationResponse) {
        expect(payload.receipt).toMatchObject({ applied: true, verified: true, githubActions: [{ id: 'create-ready-for-agent-label', status: 'failed' }] });
        await expect(readFile(path.join(repository, '.agent-orchestration-kit/config.yaml'), 'utf8')).resolves.toContain('schemaVersion: 1');
        await expect(readFile(state, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
        expect((await readFile(log, 'utf8')).split('\n').filter((line) => line === 'create')).toHaveLength(1);
      } else {
        expect(payload.blockers?.length).toBeGreaterThan(0);
        expect(payload.receipt).toBeUndefined();
        await expect(readFile(path.join(repository, '.agent-orchestration-kit/config.yaml'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
        expect((await readFile(log, 'utf8')).split('\n').filter((line) => line === 'create')).toHaveLength(0);
      }
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  }, 20_000);

  it.each(['codex-only', 'claude-coordinator', 'claude-only', 'codex-coordinator'] as const)(
    'supports the %s profile through CLI dry-run, apply, verify, and no-op',
    async (profile) => {
      const repository = await mkdtemp(path.join(tmpdir(), `agent-orchestration-kit-cli-${profile}-`));
      try {
        await execa('git', ['-C', repository, 'init', '--quiet', '-b', 'main']);
        await execa('git', ['-C', repository, 'remote', 'add', 'origin', `git@github.com:DYEWolf/${profile}.git`]);

        const dryRun = JSON.parse((await runCli([
          'init', repository, '--profile', profile, '--dry-run', '--json',
        ])).stdout) as { canApply: boolean; summary: { create: number } };
        const first = JSON.parse((await runCli([
          'init', repository, '--profile', profile, '--yes', '--json',
        ])).stdout) as { receipt: { applied: boolean; verified: boolean; written: string[] } };
        const second = JSON.parse((await runCli([
          'init', repository, '--profile', profile, '--yes', '--json',
        ])).stdout) as { receipt: { applied: boolean; written: string[] } };

        expect(dryRun.canApply).toBe(true);
        expect(first.receipt).toMatchObject({ applied: true, verified: true });
        expect(first.receipt.written).toHaveLength(dryRun.summary.create);
        expect(second.receipt).toMatchObject({ applied: false, written: [] });
      } finally {
        await rm(repository, { recursive: true, force: true });
      }
    },
    20_000,
  );

  it('runs deterministic Claude Doctor checks through a fake executable', async () => {
    const repository = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-cli-claude-'));
    const fakeBin = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-fake-bin-'));
    try {
      await execa('git', ['-C', repository, 'init', '--quiet', '-b', 'main']);
      await execa('git', ['-C', repository, 'remote', 'add', 'origin', 'git@github.com:DYEWolf/fake-claude.git']);
      const fakeClaude = path.join(fakeBin, 'claude');
      await writeFile(fakeClaude, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--version') process.stdout.write('2.1.236\\n');
else if (args.length === 3 && args[0] === 'auth' && args[1] === 'status' && args[2] === '--json') process.stdout.write('{"loggedIn":true}\\n');
else process.exit(4);
`, { encoding: 'utf8', mode: 0o755 });
      await chmod(fakeClaude, 0o755);
      const environment = {
        ...process.env,
        PATH: `${fakeBin}${path.delimiter}${process.env['PATH'] ?? ''}`,
      };

      await runCli(['init', repository, '--profile', 'claude-only', '--yes', '--json'], true, environment);
      const doctor = JSON.parse((await runCli(['doctor', repository, '--json'], true, environment)).stdout) as {
        healthy: boolean;
        checks: { id: string; status: string }[];
      };
      expect(doctor.healthy).toBe(true);
      expect(doctor.checks).toContainEqual({ id: 'claude-cli', status: 'PASS', message: expect.any(String) });
      expect(doctor.checks).toContainEqual({ id: 'claude-version', status: 'PASS', message: expect.any(String) });
      expect(doctor.checks).toContainEqual({ id: 'claude-auth', status: 'PASS', message: expect.any(String) });
      expect(doctor.checks).toContainEqual({ id: 'routing-local', status: 'WARN', message: expect.any(String) });
    } finally {
      await Promise.all([
        rm(repository, { recursive: true, force: true }),
        rm(fakeBin, { recursive: true, force: true }),
      ]);
    }
  }, 20_000);

  it('reports every executed external action in text mode', async () => {
    const repository = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-cli-text-'));
    try {
      await execa('git', ['-C', repository, 'init', '--quiet', '-b', 'main']);
      await execa('git', ['-C', repository, 'remote', 'add', 'origin', 'git@github.com:DYEWolf/text.git']);
      const result = await runCli(['init', repository, '--profile', 'codex-only', '--yes'], true, {
        AOK_ORCA_SKILLS: 'absent',
        AOK_ORCA_REPOS: 'none',
      });
      expect(result.stdout).toContain('Orca action install-orchestration-skill: EXECUTED');
      expect(result.stdout).toContain('Orca action register-repository: EXECUTED');
      expect(result.stdout).toContain('Verification: PASS');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  }, 20_000);

  it('reports external-only success accurately in text mode', async () => {
    const repository = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-cli-external-only-text-'));
    try {
      await execa('git', ['-C', repository, 'init', '--quiet', '-b', 'main']);
      await execa('git', ['-C', repository, 'remote', 'add', 'origin', 'git@github.com:DYEWolf/external-only-text.git']);
      const absent = { AOK_ORCA_SKILLS: 'absent', AOK_ORCA_REPOS: 'none' };
      await runCli(['init', repository, '--profile', 'codex-only', '--yes', '--no-global', '--no-orca-registration'], true, absent);
      const result = await runCli(['init', repository, '--profile', 'codex-only', '--yes'], true, absent);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No local files changed');
      expect(result.stdout).toContain('2 Orca actions completed successfully');
      expect(result.stdout).toContain('install-orchestration-skill');
      expect(result.stdout).toContain('register-repository');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  }, 20_000);

  it('reports external-only success accurately in JSON mode', async () => {
    const repository = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-cli-external-only-json-'));
    try {
      await execa('git', ['-C', repository, 'init', '--quiet', '-b', 'main']);
      await execa('git', ['-C', repository, 'remote', 'add', 'origin', 'git@github.com:DYEWolf/external-only-json.git']);
      const absent = { AOK_ORCA_SKILLS: 'absent', AOK_ORCA_REPOS: 'none' };
      await runCli(['init', repository, '--profile', 'codex-only', '--yes', '--no-global', '--no-orca-registration'], true, absent);
      const result = await runCli(['init', repository, '--profile', 'codex-only', '--yes', '--json'], true, absent);
      const payload = JSON.parse(result.stdout) as { receipt: { applied: boolean; written: string[]; reason: string; externalActions: { id: string; status: string }[] } };
      expect(payload.receipt).toMatchObject({ applied: false, written: [] });
      expect(payload.receipt.reason).toContain('No local files changed');
      expect(payload.receipt.reason).toContain('2 Orca actions completed successfully');
      expect(payload.receipt.externalActions).toEqual([
        { id: 'install-orchestration-skill', status: 'executed', message: expect.any(String) },
        { id: 'register-repository', status: 'executed', message: expect.any(String) },
      ]);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  }, 20_000);

  it('reports external-only failure accurately in text mode and stops later actions', async () => {
    const repository = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-cli-external-only-failure-'));
    try {
      await execa('git', ['-C', repository, 'init', '--quiet', '-b', 'main']);
      await execa('git', ['-C', repository, 'remote', 'add', 'origin', 'git@github.com:DYEWolf/external-only-failure.git']);
      const absent = { AOK_ORCA_SKILLS: 'absent', AOK_ORCA_REPOS: 'none' };
      await runCli(['init', repository, '--profile', 'codex-only', '--yes', '--no-global', '--no-orca-registration'], true, absent);
      const result = await runCli(['init', repository, '--profile', 'codex-only', '--yes'], false, { ...absent, AOK_ORCA_FAIL_ACTION: 'install' });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain('No local files changed');
      expect(result.stdout).toContain('install-orchestration-skill failed');
      expect(result.stdout).toContain('register-repository was not attempted');
      expect(result.stdout).not.toContain('Orca action register-repository:');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  }, 20_000);

  it('reports external-only failure accurately in JSON mode and stops later actions', async () => {
    const repository = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-cli-external-only-failure-json-'));
    try {
      await execa('git', ['-C', repository, 'init', '--quiet', '-b', 'main']);
      await execa('git', ['-C', repository, 'remote', 'add', 'origin', 'git@github.com:DYEWolf/external-only-failure-json.git']);
      const absent = { AOK_ORCA_SKILLS: 'absent', AOK_ORCA_REPOS: 'none' };
      await runCli(['init', repository, '--profile', 'codex-only', '--yes', '--no-global', '--no-orca-registration'], true, absent);
      const result = await runCli(['init', repository, '--profile', 'codex-only', '--yes', '--json'], false, { ...absent, AOK_ORCA_FAIL_ACTION: 'install' });
      expect(result.exitCode).toBe(2);
      const payload = JSON.parse(result.stdout) as { receipt: { applied: boolean; written: string[]; reason: string; externalActions: { id: string; status: string }[] } };
      expect(payload.receipt).toMatchObject({ applied: false, written: [] });
      expect(payload.receipt.reason).toContain('No local files changed');
      expect(payload.receipt.reason).toContain('install-orchestration-skill failed');
      expect(payload.receipt.reason).toContain('register-repository was not attempted');
      expect(payload.receipt.externalActions).toEqual([
        { id: 'install-orchestration-skill', status: 'failed', message: expect.any(String) },
      ]);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  }, 20_000);

  it('renders every Orca target and round-trippable argv in human dry-run output', async () => {
    const temporary = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-cli-text-argv-'));
    const repository = path.join(temporary, 'repo with spaces - revisión');
    try {
      await mkdir(repository);
      await execa('git', ['-C', repository, 'init', '--quiet', '-b', 'main']);
      await execa('git', ['-C', repository, 'remote', 'add', 'origin', 'git@github.com:DYEWolf/text-argv.git']);
      const result = await runCli(['init', repository, '--profile', 'codex-only', '--dry-run'], true, {
        AOK_ORCA_SKILLS: 'absent',
        AOK_ORCA_REPOS: 'none',
      });
      const canonicalRepository = await realpath(repository);
      const lines = result.stdout.split('\n');
      const skillLine = lines.find((line) => line.includes('install-orchestration-skill'));
      const repositoryLine = lines.find((line) => line.includes('register-repository'));
      const githubLine = lines.find((line) => line.includes('create-ready-for-agent-label'));
      expect(skillLine).toContain('target="global orchestration skill"');
      expect(repositoryLine).toContain(`target=${JSON.stringify(canonicalRepository)}`);
      expect(githubLine).toContain('target="github.com/DYEWolf/text-argv"');
      expect(githubLine).toContain('repositoryNodeId="R_fixture"');
      expect(githubLine).toContain('name="ready-for-agent"');
      expect(githubLine).toContain('color="0E8A16"');
      expect(githubLine).toContain(`description=${JSON.stringify('Approved, executable, unblocked implementation issue ready to be claimed.')}`);
      expect(parseHumanArgv(skillLine!)).toEqual(['skills', 'install', '--skill', 'orchestration']);
      expect(parseHumanArgv(repositoryLine!)).toEqual(['repo', 'add', '--path', canonicalRepository]);
      expect(parseHumanArgv(githubLine!)).toEqual([
        'api', 'graphql', '--hostname', 'github.com',
        '-f', 'query=mutation($repositoryId: ID!, $name: String!, $color: String!, $description: String!) { createLabel(input: { repositoryId: $repositoryId, name: $name, color: $color, description: $description }) { label { name color description repository { id } } } }',
        '-f', 'repositoryId=R_fixture', '-f', 'name=ready-for-agent', '-f', 'color=0E8A16',
        '-f', 'description=Approved, executable, unblocked implementation issue ready to be claimed.',
      ]);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }, 20_000);

  it('reports a failed external receipt, stops subsequent actions, and keeps local writes', async () => {
    const repository = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-cli-failure-'));
    try {
      await execa('git', ['-C', repository, 'init', '--quiet', '-b', 'main']);
      await execa('git', ['-C', repository, 'remote', 'add', 'origin', 'git@github.com:DYEWolf/failure.git']);
      const result = await runCli(['init', repository, '--profile', 'codex-only', '--yes'], false, {
        AOK_ORCA_SKILLS: 'absent',
        AOK_ORCA_REPOS: 'none',
        AOK_ORCA_FAIL_ACTION: 'install',
      });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain('Orca action install-orchestration-skill: FAILED');
      expect(result.stdout).not.toContain('Orca action register-repository:');
      expect(result.stdout).toContain('Verification: PASS');
      expect(await readFile(path.join(repository, '.agent-orchestration-kit/config.yaml'), 'utf8')).toContain('schemaVersion: 1');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  }, 20_000);

  it('honors each external disable flag in dry-run JSON', async () => {
    const repository = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-cli-flags-'));
    try {
      await execa('git', ['-C', repository, 'init', '--quiet', '-b', 'main']);
      await execa('git', ['-C', repository, 'remote', 'add', 'origin', 'git@github.com:DYEWolf/flags.git']);
      const noGlobal = JSON.parse((await runCli([
        'init', repository, '--profile', 'codex-only', '--dry-run', '--json', '--no-global',
      ], true, { AOK_ORCA_SKILLS: 'absent', AOK_ORCA_REPOS: 'none' })).stdout) as { globalCommands: { id: string; state: string }[] };
      expect(noGlobal.globalCommands).toEqual([
        expect.objectContaining({ id: 'install-orchestration-skill', state: 'suppressed' }),
        expect.objectContaining({ id: 'register-repository', state: 'planned' }),
      ]);
      const both = JSON.parse((await runCli([
        'init', repository, '--profile', 'codex-only', '--dry-run', '--json', '--no-global', '--no-orca-registration',
      ], true, { AOK_ORCA_SKILLS: 'absent', AOK_ORCA_REPOS: 'none' })).stdout) as { globalCommands: { state: string }[] };
      expect(both.globalCommands.map((action) => action.state)).toEqual(['suppressed', 'suppressed']);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  }, 20_000);

  it('does not write when JSON mode is requested without explicit confirmation', async () => {
    // Prompt denial is not portable in subprocess tests; this is the CLI's
    // deterministic noninteractive mapping for missing confirmation.
    const repository = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-cli-no-confirmation-'));
    const state = path.join(repository, 'fake-gh-state');
    const log = path.join(repository, 'fake-gh-log');
    try {
      await execa('git', ['-C', repository, 'init', '--quiet', '-b', 'main']);
      await execa('git', ['-C', repository, 'remote', 'add', 'origin', 'git@github.com:DYEWolf/no-confirmation.git']);
      await writeFile(log, '');
      const result = await runCli(['init', repository, '--profile', 'codex-only', '--json'], false, {
        AOK_GH_STATE: state,
        AOK_GH_LOG: log,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('--json requires --yes or --dry-run');
      await expect(readFile(path.join(repository, '.agent-orchestration-kit/config.yaml'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      expect((await readFile(log, 'utf8')).split('\n').filter((line) => line === 'create')).toHaveLength(0);
      await expect(readFile(state, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  }, 20_000);
});

async function runCli(arguments_: string[], reject = true, env?: NodeJS.ProcessEnv) {
  return execa('node', [...cliArguments, ...arguments_], {
    cwd: path.resolve('.'),
    reject,
    env: {
      ...process.env,
      ...(env ?? {}),
      AOK_ORCA_REPO: env?.['AOK_ORCA_REPO'] ?? arguments_[1] ?? '',
      PATH: `${path.resolve('test/fixtures')}${path.delimiter}${env?.['PATH'] ?? process.env['PATH'] ?? ''}`,
    },
  });
}

function parseHumanArgv(line: string): string[] {
  const start = line.indexOf(' argv=') + ' argv='.length;
  const end = line.indexOf(' — ', start);
  return JSON.parse(line.slice(start, end)) as string[];
}
