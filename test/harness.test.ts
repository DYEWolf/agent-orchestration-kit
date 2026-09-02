import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { NodeHarnessAdapter } from '../src/adapters/harness/node-harness.js';

const fakeExecutableSource = `#!/usr/bin/env node
const args = process.argv.slice(2);
const mode = process.env.FAKE_CLAUDE_MODE;
if (args.length === 1 && args[0] === '--version') {
  if (mode === 'missing-version') process.exit(9);
  if (mode === 'command-failure') process.exit(7);
  if (mode === 'malformed-version') process.stdout.write('Claude Code unknown\\n');
  else if (mode === 'outdated') process.stdout.write('2.1.235\\n');
  else process.stdout.write('2.1.236 (Claude Code)\\n');
} else if (args.length === 3 && args[0] === 'auth' && args[1] === 'status' && args[2] === '--json') {
  if (mode === 'auth-command-failure') process.exit(8);
  if (mode === 'auth-malformed') process.stdout.write('{"loggedIn":"yes"}\\n');
  else if (mode === 'unauthenticated') process.stdout.write('{"loggedIn":false}\\n');
  else process.stdout.write('{"loggedIn":true}\\n');
} else {
  process.exit(6);
}
`;

describe('NodeHarnessAdapter', () => {
  it.each([
    ['installed and authenticated', 'ok', 'pass', 'none', 'pass', 'none', 'pass', 'none'],
    ['version command failure', 'missing-version', 'fail', 'command-failure', 'fail', 'command-failure', 'skip', 'not-checked'],
    ['outdated', 'outdated', 'pass', 'none', 'fail', 'outdated', 'pass', 'none'],
    ['malformed version', 'malformed-version', 'pass', 'none', 'fail', 'malformed', 'pass', 'none'],
    ['unauthenticated', 'unauthenticated', 'pass', 'none', 'pass', 'none', 'fail', 'unauthenticated'],
    ['malformed auth', 'auth-malformed', 'pass', 'none', 'pass', 'none', 'fail', 'malformed'],
    ['auth command failure', 'auth-command-failure', 'pass', 'none', 'pass', 'none', 'fail', 'command-failure'],
  ] as const)('%s is classified without login', async (_name, mode, cli, cliReason, version, versionReason, auth, authReason) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-fake-claude-'));
    const executable = path.join(directory, 'claude');
    try {
      await writeFile(executable, fakeExecutableSource, { encoding: 'utf8', mode: 0o755 });
      await chmod(executable, 0o755);
      const report = await new NodeHarnessAdapter({ executable, env: { FAKE_CLAUDE_MODE: mode } }).checkClaude();
      expect(report.cli.status).toBe(cli);
      expect(report.cli.reason ?? 'none').toBe(cliReason);
      expect(report.version.status).toBe(version);
      expect(report.version.reason ?? 'none').toBe(versionReason);
      expect(report.authentication.status).toBe(auth);
      expect(report.authentication.reason ?? 'none').toBe(authReason);
      expect(report.authentication.reason).not.toBe('login');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('distinguishes an absent executable from a command failure', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-fake-claude-'));
    try {
      const report = await new NodeHarnessAdapter({
        executable: path.join(directory, 'claude-does-not-exist'),
      }).checkClaude();
      expect(report.cli).toMatchObject({ status: 'fail', reason: 'missing' });
      expect(report.version).toMatchObject({ status: 'fail', reason: 'missing' });
      expect(report.authentication).toMatchObject({ status: 'skip', reason: 'not-checked' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
