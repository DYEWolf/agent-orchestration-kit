import path from 'node:path';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { NodeOrcaAdapter } from '../src/adapters/orca/node-orca.js';
import { ORCA_MINIMUM_VERSION, compareOrcaVersions, requiredOrcaActions } from '../src/adapters/orca/orca.js';
import { writePortableTool } from './helpers/portable-launcher.js';

const requiredCommands: readonly (readonly [string, readonly string[]])[] = [
  ['agent-context', ['json']],
  ['status', ['json']],
  ['skills installed', ['json']],
  ['repo list', ['json']],
  ['skills install', ['skill', 'dry-run']],
  ['repo add', ['path']],
];

const absentCommandMessage = process.platform === 'win32'
  ? 'Orca agent-context command failed.'
  : 'Orca CLI was not found on PATH.';

const fakeSource = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const command = args.slice(0, 2).join(' ');
if (process.env.AOK_LOG) fs.appendFileSync(process.env.AOK_LOG, JSON.stringify(args) + '\\n');
if (process.env.AOK_HANG === '1') setInterval(() => {}, 1000);
const envelope = (result) => process.stdout.write(JSON.stringify({ ok: true, result }) + '\\n');
const baseCommands = ${JSON.stringify(requiredCommands.map(([commandName, flags]) => ({ path: commandName.split(' '), flags, argumentMode: 'parsed' })))};
const omit = process.env.AOK_MISSING_COMMAND;
const wrongCommand = process.env.AOK_WRONG_COMMAND;
const missingArgumentMode = process.env.AOK_MISSING_ARGUMENT_MODE;
const malformedRequiredFlags = process.env.AOK_MALFORMED_REQUIRED_FLAGS;
const unrelated = process.env.AOK_UNRELATED === 'malformed'
  ? [{ path: ['catalog', 'future'], flags: 'malformed', argumentMode: { mode: 'future' } }]
  : [];
const commands = [...baseCommands, ...unrelated].filter((item) => item.path.join(' ') !== omit).map((item) => item.path.join(' ') === wrongCommand ? { ...item, flags: [process.env.AOK_WRONG_FLAG || 'wrong'] } : item).map((item) => item.path.join(' ') === malformedRequiredFlags ? { ...item, flags: 'malformed' } : item).map((item) => {
  if (item.path.join(' ') !== missingArgumentMode) return item;
  const { argumentMode, ...withoutArgumentMode } = item;
  return withoutArgumentMode;
});
if (command === 'agent-context --json') {
  if (process.env.AOK_CONTEXT === 'fail') process.exit(7);
  if (process.env.AOK_CONTEXT === 'malformed') process.stdout.write('not-json\\n');
  else {
    const result = { schemaVersion: process.env.AOK_SCHEMA === 'drift' ? 2 : 1, commandCount: commands.length, commands };
    if (process.env.AOK_CONTEXT === 'missing-count') delete result.commandCount;
    if (process.env.AOK_CONTEXT === 'missing-commands') delete result.commands;
    if (process.env.AOK_CONTEXT === 'bad-count') result.commandCount = 99;
    process.stdout.write(JSON.stringify(result) + '\\n');
  }
} else if (command === 'status --json') {
  if (process.env.AOK_STATUS === 'fail') process.exit(7);
  if (process.env.AOK_STATUS === 'malformed') process.stdout.write('{broken\\n');
  else {
    const capabilities = ['runtime.status.compat.v1', 'orchestration.contract.v1'].filter((item) => item !== process.env.AOK_CAPABILITY);
    const result = { runtime: { state: process.env.AOK_READY === 'runtime-state' ? 'starting' : 'ready', reachable: process.env.AOK_READY !== 'reachable', appVersion: process.env.AOK_VERSION || '1.4.190', capabilities }, graph: { state: process.env.AOK_READY === 'graph-state' ? 'starting' : 'ready' } };
    const missing = process.env.AOK_STATUS_MISSING;
    if (missing === 'runtime') delete result.runtime;
    if (missing === 'graph') delete result.graph;
    if (missing === 'appVersion') delete result.runtime.appVersion;
    if (missing === 'capabilities') delete result.runtime.capabilities;
    if (missing === 'reachable') delete result.runtime.reachable;
    if (missing === 'state') delete result.runtime.state;
    if (missing === 'graphState') delete result.graph.state;
    envelope(result);
  }
} else if (command === 'skills installed') {
  if (process.env.AOK_SKILLS === 'fail') process.exit(7);
  if (process.env.AOK_SKILLS === 'malformed') envelope({ skills: [{ bad: true }] });
  else if (process.env.AOK_SKILLS === 'missing') envelope({});
  else envelope({ skills: process.env.AOK_SKILLS === 'absent' ? [] : [{ name: 'orchestration' }] });
} else if (command === 'repo list') {
  if (process.env.AOK_REPOS_MODE === 'fail') process.exit(7);
  if (process.env.AOK_REPOS_MODE === 'malformed') envelope({ repos: [{ bad: true }] });
  else if (process.env.AOK_REPOS_MODE === 'missing') envelope({});
  else envelope({ repos: JSON.parse(process.env.AOK_REPOS || '[]').map((item) => typeof item === 'string' ? { path: item } : item) });
} else if (args[0] === 'skills' && args[1] === 'install') {
  if (process.env.AOK_EXECUTE === 'fail') { process.stdout.write(process.env.AOK_SECRET || 'secret-sentinel'); process.stderr.write(process.env.AOK_SECRET || 'secret-sentinel'); process.exit(9); }
} else if (args[0] === 'repo' && args[1] === 'add') {
  if (process.env.AOK_EXECUTE === 'fail') process.exit(9);
} else process.exit(8);
`;

describe('Orca adapter', () => {
  it.each(['1.4.190', '1.4.191', '2.0.0'] as const)(
    'accepts the live unwrapped agent-context root at %s and newer',
    async (version) => {
      await withFakeOrca({ AOK_VERSION: version, AOK_REPOS: JSON.stringify([]) }, async ({ adapter, root }) => {
        const discovery = await adapter.discover(root);
        expect(discovery).toMatchObject({
          cli: { status: 'pass' }, compatibility: { status: 'pass' }, readiness: { status: 'pass' },
          globalSkill: { status: 'pass' }, repository: { status: 'fail' }, canInstallSkill: true, canRegisterRepository: true,
        });
      });
    },
  );

  it('uses exact argv without a shell and returns exact allowed mutation argv', async () => {
    await withFakeOrca({ AOK_LOG: 'argv.log', AOK_REPOS: JSON.stringify([]) }, async ({ adapter, root, temporary }) => {
      const discovery = await adapter.discover(root);
      expect(discovery.compatibility.status).toBe('pass');
      expect(await adapter.execute(requiredOrcaActions(root)[0]!)).toMatchObject({ status: 'executed' });
      expect(await adapter.execute(requiredOrcaActions(root)[1]!)).toMatchObject({ status: 'executed' });
      const calls = (await readFile(path.join(temporary, 'argv.log'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
      expect(calls.slice(0, 2)).toEqual([['agent-context', '--json'], ['status', '--json']]);
      expect(calls.slice(2, 4)).toEqual(expect.arrayContaining([['skills', 'installed', '--json'], ['repo', 'list', '--json']]));
      expect(calls.slice(4)).toEqual([['skills', 'install', '--skill', 'orchestration'], ['repo', 'add', '--path', root]]);
    });
  });

  it.each([
    ['missing executable', 'missing', 'Orca CLI was not found on PATH.'],
    ['nonzero process', 'fail', 'Orca agent-context command failed.'],
    ['malformed JSON', 'malformed', 'Orca agent-context returned malformed JSON.'],
  ] as const)('sanitizes %s discovery diagnostics', async (_label, mode, message) => {
    if (mode === 'missing') {
      const discovery = await new NodeOrcaAdapter({ executable: path.join(tmpdir(), 'does-not-exist-orca') }).discover('/missing');
      expect(discovery.cli.message).toBe(absentCommandMessage);
      expect(JSON.stringify(discovery)).not.toContain('/missing');
      return;
    }
    await withFakeOrca({ AOK_CONTEXT: mode }, async ({ adapter, root }) => {
      const discovery = await adapter.discover(root);
      expect(discovery.cli.message).toBe(message);
      expect(JSON.stringify(discovery)).not.toContain('secret-sentinel');
    });
  });

  it.each(requiredCommands.map(([name]) => name))('reports each missing required command record: %s', async (missing) => {
    await withFakeOrca({ AOK_MISSING_COMMAND: missing }, async ({ adapter, root }) => {
      const discovery = await adapter.discover(root);
      expect(discovery.compatibility).toMatchObject({ status: 'fail', message: expect.stringContaining(missing) });
      expect(discovery.canInstallSkill).toBe(false);
      expect(discovery.canRegisterRepository).toBe(false);
    });
  });

  it.each([
    ['schema drift', { AOK_SCHEMA: 'drift' }, 'schemaVersion'],
    ['missing commandCount', { AOK_CONTEXT: 'missing-count' }, 'commandCount'],
    ['missing commands', { AOK_CONTEXT: 'missing-commands' }, 'commands'],
    ['wrong commandCount', { AOK_CONTEXT: 'bad-count' }, 'commandCount'],
  ] as const)('rejects agent-context %s', async (_label, environment, field) => {
    await withFakeOrca(environment, async ({ adapter, root }) => {
      const discovery = await adapter.discover(root);
      expect(discovery.cli.status).toBe('fail');
      expect(discovery.cli.message).toContain(field);
      expect(discovery.compatibility.status).toBe('skip');
    });
  });

  it.each(requiredCommands.map(([name, flags]) => [name, flags[0]!] as const))('rejects a required record with the wrong exact %s flag/path contract', async (name, flag) => {
    await withFakeOrca({ AOK_WRONG_COMMAND: name, AOK_WRONG_FLAG: `not-${flag}` }, async ({ adapter, root }) => {
      const discovery = await adapter.discover(root);
      expect(discovery.compatibility.status).toBe('fail');
      expect(discovery.compatibility.message).toContain(name);
      expect(discovery.compatibility.message).toContain(flag);
    });
  });

  it('does not require argument mode for required command records', async () => {
    await withFakeOrca({ AOK_MISSING_ARGUMENT_MODE: 'repo add' }, async ({ adapter, root }) => {
      const discovery = await adapter.discover(root);
      expect(discovery.cli.status).toBe('pass');
      expect(discovery.compatibility.status).toBe('pass');
    });
  });

  it('ignores malformed unrelated command records', async () => {
    await withFakeOrca({ AOK_UNRELATED: 'malformed' }, async ({ adapter, root }) => {
      const discovery = await adapter.discover(root);
      expect(discovery.compatibility.status).toBe('pass');
    });
  });

  it('reports malformed required flags with the required command name', async () => {
    await withFakeOrca({ AOK_MALFORMED_REQUIRED_FLAGS: 'repo add' }, async ({ adapter, root }) => {
      const discovery = await adapter.discover(root);
      expect(discovery.compatibility).toMatchObject({
        status: 'fail',
        message: expect.stringContaining('repo add'),
      });
      expect(discovery.compatibility.message).toContain('flags');
    });
  });

  it('requires the skill install dry-run capability', async () => {
    await withFakeOrca({ AOK_WRONG_COMMAND: 'skills install', AOK_WRONG_FLAG: 'skill' }, async ({ adapter, root }) => {
      const discovery = await adapter.discover(root);
      expect(discovery.compatibility).toMatchObject({ status: 'fail', message: expect.stringContaining('dry-run') });
    });
  });

  it.each([
    ['malformed JSON', { AOK_STATUS: 'malformed' }, 'malformed'],
    ['missing runtime', { AOK_STATUS_MISSING: 'runtime' }, 'runtime'],
    ['missing graph', { AOK_STATUS_MISSING: 'graph' }, 'graph'],
    ['missing appVersion', { AOK_STATUS_MISSING: 'appVersion' }, 'runtime.appVersion'],
    ['missing capabilities', { AOK_STATUS_MISSING: 'capabilities' }, 'runtime.capabilities'],
    ['malformed semver', { AOK_VERSION: '1.4' }, 'appVersion'],
  ] as const)('reports status %s without probing external reads', async (_label, environment, detail) => {
    await withFakeOrca({ ...environment, AOK_REPOS: JSON.stringify([]) }, async ({ adapter, root }) => {
      const discovery = await adapter.discover(root);
      expect(discovery.compatibility.status).toBe('fail');
      expect(discovery.compatibility.message).toContain(detail);
      expect(discovery.readiness.status).toBe(_label === 'malformed semver' ? 'pass' : 'skip');
      expect(discovery.globalSkill.status).toBe('skip');
      expect(discovery.repository.status).toBe('skip');
      expect(discovery.canInstallSkill).toBe(false);
      expect(discovery.canRegisterRepository).toBe(false);
    });
  });

  it('maps status process failure to compatibility failure and safe prerequisite skips', async () => {
    await withFakeOrca({ AOK_STATUS: 'fail' }, async ({ adapter, root }) => {
      const discovery = await adapter.discover(root);
      expect(discovery).toMatchObject({ cli: { status: 'pass' }, compatibility: { status: 'fail', message: 'Orca status command failed.' }, readiness: { status: 'skip' }, canInstallSkill: false, canRegisterRepository: false });
    });
  });

  it.each([
    ['outdated', { AOK_VERSION: '1.4.189' }, 'below the minimum'],
    ['missing runtime status capability', { AOK_CAPABILITY: 'runtime.status.compat.v1' }, 'runtime.status.compat.v1'],
    ['missing orchestration capability', { AOK_CAPABILITY: 'orchestration.contract.v1' }, 'orchestration.contract.v1'],
  ] as const)('rejects %s while naming the narrow compatibility boundary', async (_label, environment, detail) => {
    await withFakeOrca(environment, async ({ adapter, root }) => {
      const discovery = await adapter.discover(root);
      expect(discovery.compatibility).toMatchObject({ status: 'fail', message: expect.stringContaining(detail) });
      expect(discovery.globalSkill.status).toBe('skip');
      expect(discovery.repository.status).toBe('skip');
    });
  });

  it.each([
    ['runtime state', { AOK_READY: 'runtime-state' }, 'runtime.state=ready'],
    ['runtime reachable', { AOK_READY: 'reachable' }, 'runtime.reachable=true'],
    ['graph state', { AOK_READY: 'graph-state' }, 'graph.state=ready'],
  ] as const)('reports unready %s boundary', async (_label, environment, detail) => {
    await withFakeOrca(environment, async ({ adapter, root }) => {
      const discovery = await adapter.discover(root);
      expect(discovery.compatibility.status).toBe('pass');
      expect(discovery.readiness).toMatchObject({ status: 'fail', message: expect.stringContaining(detail) });
      expect(discovery.canInstallSkill).toBe(false);
      expect(discovery.canRegisterRepository).toBe(false);
    });
  });

  it.each([
    ['skill read failure', { AOK_SKILLS: 'fail' }, { AOK_REPOS: 'ROOT' }, 'skills installed command failed'],
    ['skill malformed field', { AOK_SKILLS: 'malformed' }, { AOK_REPOS: 'ROOT' }, 'malformed name'],
    ['repository read failure', { AOK_REPOS_MODE: 'fail' }, { AOK_REPOS: 'ROOT' }, 'repo list command failed'],
    ['repository malformed field', { AOK_REPOS_MODE: 'malformed' }, { AOK_REPOS: 'ROOT' }, 'malformed path'],
  ] as const)('maps %s independently while preserving the other probe', async (_label, first, second, detail) => {
    await withFakeOrca({ ...first, ...second }, async ({ adapter, root }) => {
      const discovery = await adapter.discover(root);
      expect(JSON.stringify(discovery)).toContain(detail);
      if ('AOK_SKILLS' in first) expect(discovery.repository.status).toBe('pass');
      else expect(discovery.globalSkill.status).toBe('pass');
      if ('AOK_SKILLS' in first) {
        expect(discovery.canInstallSkill).toBe(false);
        expect(discovery.canRegisterRepository).toBe(true);
      } else {
        expect(discovery.canInstallSkill).toBe(true);
        expect(discovery.canRegisterRepository).toBe(false);
      }
    });
  });

  it('keeps skill and repository availability independent when either read fails', async () => {
    await withFakeOrca({ AOK_SKILLS: 'fail', AOK_REPOS: 'ROOT' }, async ({ adapter, root }) => {
      const discovery = await adapter.discover(root);
      expect(discovery.globalSkill.status).toBe('fail');
      expect(discovery.repository.status).toBe('pass');
      expect(discovery.canInstallSkill).toBe(false);
      expect(discovery.canRegisterRepository).toBe(true);
    });
    await withFakeOrca({ AOK_REPOS_MODE: 'fail' }, async ({ adapter, root }) => {
      const discovery = await adapter.discover(root);
      expect(discovery.globalSkill.status).toBe('pass');
      expect(discovery.repository.status).toBe('fail');
      expect(discovery.canInstallSkill).toBe(true);
      expect(discovery.canRegisterRepository).toBe(false);
    });
  });

  it('distinguishes absent skills/repos from read failures without suppressing the other action', async () => {
    await withFakeOrca({ AOK_SKILLS: 'absent', AOK_REPOS: 'ROOT' }, async ({ adapter, root }) => {
      const discovery = await adapter.discover(root);
      expect(discovery.globalSkill).toMatchObject({ status: 'fail', message: 'Global Orca skill orchestration is not installed.' });
      expect(discovery.repository.status).toBe('pass');
      expect(discovery.canInstallSkill).toBe(true);
      expect(discovery.canRegisterRepository).toBe(true);
    });
    await withFakeOrca({ AOK_REPOS: JSON.stringify([]) }, async ({ adapter, root }) => {
      const discovery = await adapter.discover(root);
      expect(discovery.globalSkill.status).toBe('pass');
      expect(discovery.repository).toMatchObject({ status: 'fail', message: 'Repository is not registered with Orca by canonical path.' });
      expect(discovery.canInstallSkill).toBe(true);
      expect(discovery.canRegisterRepository).toBe(true);
    });
  });

  it('matches repository identity by canonical path and ignores stale metadata and broken candidates', async () => {
    const temporary = await mkdtemp(path.join(tmpdir(), 'aok-orca-path-'));
    const alias = path.join(temporary, 'alias');
    const fake = path.join(temporary, 'orca');
    try {
      await symlink(temporary, alias);
      await writeFile(fake, fakeSource, { mode: 0o755 });
      await chmod(fake, 0o755);
      const adapter = new NodeOrcaAdapter({
        executable: fake,
        env: { ...process.env, AOK_REPOS: JSON.stringify(['/does/not/exist', alias]), AOK_REPO_METADATA: 'stale' },
      });
      const discovery = await adapter.discover(temporary);
      expect(discovery.repository).toMatchObject({ status: 'pass' });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('recognizes a linked Git worktree through its canonical main repository path', async () => {
    const temporary = await mkdtemp(path.join(tmpdir(), 'aok-orca-worktree-'));
    const mainRoot = path.join(temporary, 'main');
    const worktreeRoot = path.join(temporary, 'worktree');
    const fake = path.join(temporary, 'orca');
    try {
      await mkdir(path.join(mainRoot, '.git', 'worktrees', 'linked'), { recursive: true });
      await mkdir(worktreeRoot, { recursive: true });
      await writeFile(path.join(worktreeRoot, '.git'), `gitdir: ${path.join(mainRoot, '.git', 'worktrees', 'linked')}\n`);
      await writeFile(fake, fakeSource, { mode: 0o755 });
      await chmod(fake, 0o755);
      const adapter = new NodeOrcaAdapter({ executable: fake, env: { ...process.env, AOK_REPOS: JSON.stringify([mainRoot]) } });
      const discovery = await adapter.discover(worktreeRoot);
      expect(discovery.repository.status).toBe('pass');
      expect(discovery.repositoryTarget).toBe(await realpath(mainRoot));
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('sanitizes arbitrary mutation failures and timeouts', async () => {
    await withFakeOrca({ AOK_EXECUTE: 'fail', AOK_SECRET: 'secret-sentinel' }, async ({ adapter, root }) => {
      const receipt = await adapter.execute(requiredOrcaActions(root)[0]!);
      expect(receipt).toEqual({ id: 'install-orchestration-skill', status: 'failed', message: 'Orca global skill installation failed.' });
      expect(JSON.stringify(receipt)).not.toContain('secret-sentinel');
    });
    await withFakeOrca({ AOK_HANG: '1' }, async ({ adapter, root }) => {
      const receipt = await adapter.execute(requiredOrcaActions(root)[0]!);
      expect(receipt.status).toBe('failed');
      expect(receipt.message).toMatch(/timed out|failed|could not be executed/u);
    }, 20);
  });

  it('preserves version comparison semantics', () => {
    expect(compareOrcaVersions(ORCA_MINIMUM_VERSION, ORCA_MINIMUM_VERSION)).toBe(0);
    expect(compareOrcaVersions('1.4.189', ORCA_MINIMUM_VERSION)).toBeLessThan(0);
    expect(compareOrcaVersions('1.4.190', '1.4.191')).toBeLessThan(0);
    expect(compareOrcaVersions('not-semver', ORCA_MINIMUM_VERSION)).toBeUndefined();
    expect(compareOrcaVersions('01.4.190', ORCA_MINIMUM_VERSION)).toBeUndefined();
  });
});

async function withFakeOrca(
  environment: Readonly<Record<string, string>>,
  callback: (context: { adapter: NodeOrcaAdapter; root: string; temporary: string }) => Promise<void>,
  timeoutMs = 2_000,
): Promise<void> {
  const temporary = await mkdtemp(path.join(tmpdir(), 'aok-orca-'));
  const executable = await writePortableTool(temporary, 'orca', fakeSource);
  const root = path.join(temporary, 'repository');
  await mkdir(root, { recursive: true });
  const repos = environment['AOK_REPOS'] === 'ROOT' ? JSON.stringify([root]) : environment['AOK_REPOS'];
  const logPath = environment['AOK_LOG'] === 'argv.log' ? path.join(temporary, 'argv.log') : environment['AOK_LOG'];
  const adapter = new NodeOrcaAdapter({ executable, timeoutMs, env: { ...process.env, ...environment, ...(repos === undefined ? {} : { AOK_REPOS: repos }), ...(logPath === undefined ? {} : { AOK_LOG: logPath }) } });
  try {
    await callback({ adapter, root, temporary });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
