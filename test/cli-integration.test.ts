import path from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
});

async function runCli(arguments_: string[], reject = true) {
  return execa('node', [...cliArguments, ...arguments_], { cwd: path.resolve('.'), reject });
}
