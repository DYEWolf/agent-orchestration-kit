import path from 'node:path';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

const cliArguments = ['--import', 'tsx', 'src/cli.ts'];

describe('local CLI installation lifecycle', () => {
  it('dry-runs, applies, verifies, no-ops, and refuses drift', async () => {
    const repository = await mkdtemp(path.join(tmpdir(), 'orca-kit-cli-integration-'));
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

  it.each(['codex-only', 'claude-coordinator', 'claude-only', 'codex-coordinator'] as const)(
    'supports the %s profile through CLI dry-run, apply, verify, and no-op',
    async (profile) => {
      const repository = await mkdtemp(path.join(tmpdir(), `orca-kit-cli-${profile}-`));
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
    const repository = await mkdtemp(path.join(tmpdir(), 'orca-kit-cli-claude-'));
    const fakeBin = await mkdtemp(path.join(tmpdir(), 'orca-kit-fake-bin-'));
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
});

async function runCli(arguments_: string[], reject = true, env?: NodeJS.ProcessEnv) {
  return execa('node', [...cliArguments, ...arguments_], {
    cwd: path.resolve('.'),
    reject,
    ...(env === undefined ? {} : { env }),
  });
}
