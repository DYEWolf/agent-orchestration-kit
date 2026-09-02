import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

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

  it('documents that --yes accepts the complete enumerated plan, including Orca actions', async () => {
    const result = await execa('node', ['--import', 'tsx', 'src/cli.ts', 'init', '--help'], {
      reject: false,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/--yes\s+accept only the complete enumerated ChangePlan,\s+including its enumerated Orca actions/u);
    expect(result.stdout).not.toContain('enumerated local mutations');
  });
});
