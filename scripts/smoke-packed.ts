import path from 'node:path';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';

interface PackResult {
  readonly filename: string;
  readonly files: readonly { path: string }[];
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-packed-smoke-'));
const packEnvironment = { ...process.env };
for (const key of Object.keys(packEnvironment)) {
  if (/^npm_config_dry[-_]run$/i.test(key)) delete packEnvironment[key];
}

async function writePortableFakeTool(directory: string, name: string, source: string): Promise<void> {
  await writeFile(path.join(directory, `${name}.js`), source, 'utf8');
  await writeFile(
    path.join(directory, name),
    `#!/bin/sh\nexec node "$(dirname "$0")/${name}.js" "$@"\n`,
    { encoding: 'utf8', mode: 0o755 },
  );
  await chmod(path.join(directory, name), 0o755);
  await writeFile(
    path.join(directory, `${name}.cmd`),
    `@echo off\r\nnode "%~dp0${name}.js" %*\r\n`,
    { encoding: 'utf8', mode: 0o755 },
  );
}

async function archiveEntries(tarball: string): Promise<Set<string>> {
  const listing = await execa('tar', ['-tzf', path.basename(tarball)], {
    cwd: path.dirname(tarball),
  });
  return new Set(
    listing.stdout
      .split(/\r?\n/u)
      .map((entry) => entry.startsWith('package/') ? entry.slice('package/'.length) : entry)
      .filter((entry) => entry.length > 0),
  );
}

try {
  const packageDirectory = path.join(temporary, 'package');
  const installDirectory = path.join(temporary, 'install');
  const fakeBinDirectory = path.join(temporary, 'fake-bin');
  const fixtureDirectory = path.join(temporary, 'fixtures');
  const profiles = ['codex-only', 'claude-coordinator', 'claude-only', 'codex-coordinator'] as const;
  await Promise.all([
    mkdir(packageDirectory),
    mkdir(installDirectory),
    mkdir(fakeBinDirectory),
    mkdir(fixtureDirectory),
  ]);
  const repositories = new Map(
    profiles.map((profile) => [profile, path.join(fixtureDirectory, `repository ${profile} — 日本語`)] as const),
  );
  await Promise.all([...repositories.values()].map((repository) => mkdir(repository)));

  await writePortableFakeTool(fakeBinDirectory, 'claude', `const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--version') process.stdout.write('2.1.236\\n');
else if (args.length === 3 && args[0] === 'auth' && args[1] === 'status' && args[2] === '--json') process.stdout.write('{"loggedIn":true}\\n');
else process.exitCode = 4;
`);
  await writePortableFakeTool(fakeBinDirectory, 'orca', `const args = process.argv.slice(2).join(' ');
const emit = (result) => process.stdout.write(JSON.stringify({ ok: true, result }) + '\\n');
const commands = [['agent-context', ['json']], ['status', ['json']], ['skills installed', ['json']], ['repo list', ['json']], ['skills install', ['skill', 'dry-run']], ['repo add', ['path']]].map(([command, flags]) => ({ path: command.split(' '), flags, argumentMode: 'parsed' }));
if (args === 'agent-context --json') process.stdout.write(JSON.stringify({ schemaVersion: 1, commandCount: commands.length, commands }) + '\\n');
else if (args === 'status --json') emit({ runtime: { state: 'ready', reachable: true, appVersion: '1.4.190', capabilities: ['runtime.status.compat.v1', 'orchestration.contract.v1'] }, graph: { state: 'ready' } });
else if (args === 'skills installed --json') emit({ skills: [{ name: 'orchestration' }] });
else if (args === 'repo list --json') emit({ repos: [{ path: process.env.AOK_ORCA_REPO }] });
else if (args === 'skills install --skill orchestration' || args.startsWith('repo add --path ')) process.exitCode = 0;
else process.exitCode = 9;
`);
  await writePortableFakeTool(fakeBinDirectory, 'gh', `const fs = require('node:fs');
const args = process.argv.slice(2);
const query = args.find((arg) => arg.startsWith('query='))?.slice('query='.length) || '';
const values = [];
for (let cursor = 0; cursor < args.length; cursor += 1) if (args[cursor] === '-f') values.push(args[cursor + 1]);
const valueFor = (name) => values.find((value) => value?.startsWith(name + '='))?.slice(name.length + 1);
const emit = (value) => process.stdout.write(JSON.stringify(value) + '\\n');
if (process.env.AOK_GH_LOG) fs.appendFileSync(process.env.AOK_GH_LOG, JSON.stringify(args) + '\\n');
if (args.length === 1 && args[0] === '--version') process.stdout.write('gh version 2.96.0 (fake)\\n');
else if (args.join(' ') === 'auth status --hostname github.com --json hosts') emit({ hosts: { 'github.com': [{ active: true }] } });
else if (args[0] === 'api' && args[1] === 'graphql' && query.includes('repository(owner:')) emit({ data: { repository: { id: 'R_packed_fixture', nameWithOwner: 'DYEWolf/' + (valueFor('name') || 'packed') } } });
else if (args[0] === 'api' && args[1] === 'graphql' && query.includes('node(id:')) {
  if (process.env.AOK_GH_STATE && fs.existsSync(process.env.AOK_GH_STATE)) emit({ data: { node: { label: { name: 'ready-for-agent', color: '0e8a16', description: 'Approved, executable, unblocked implementation issue ready to be claimed.' } } } });
  else emit({ data: { node: { label: null } } });
}
else if (args[0] === 'api' && args[1] === 'graphql' && query.includes('mutation(')) {
  if (process.env.AOK_GH_LOG) fs.appendFileSync(process.env.AOK_GH_LOG, 'create\\n');
  if (process.env.AOK_GH_STATE) fs.writeFileSync(process.env.AOK_GH_STATE, 'created\\n');
  emit({ data: { createLabel: { label: { name: 'ready-for-agent', color: '0E8A16', description: 'Approved, executable, unblocked implementation issue ready to be claimed.', repository: { id: 'R_packed_fixture' } } } } });
  process.exitCode = 0;
}
else process.exitCode = 9;
`);

  // Keep standalone smoke runs deterministic when no prior build has produced
  // the package's executable entry point.
  await execa('npm', ['run', 'build'], { cwd: repositoryRoot, env: packEnvironment });

  const packed = await execa('npm', [
    'pack',
    '--ignore-scripts',
    '--dry-run=false',
    '--json',
    '--pack-destination',
    packageDirectory,
  ], {
    cwd: repositoryRoot,
    // `npm pack --dry-run` runs prepack and passes its dry-run config to child
    // processes. The smoke needs a real, disposable tarball to install.
    env: packEnvironment,
  });
  const [packResult] = JSON.parse(packed.stdout) as PackResult[];
  if (packResult === undefined) throw new Error('npm pack did not return a package result.');

  const includedPaths = new Set(packResult.files.map((file) => file.path));
  const tarball = path.join(packageDirectory, packResult.filename);
  const actualArchiveEntries = await archiveEntries(tarball);
  const allowedPackedPath = (entry: string) => entry === 'package.json'
    || entry === 'LICENSE'
    || entry === 'README.md'
    || entry === 'CONTRIBUTING.md'
    || entry === 'SECURITY.md'
    || entry === 'THIRD_PARTY_NOTICES.md'
    || entry.startsWith('dist/')
    || entry.startsWith('templates/')
    || entry.startsWith('docs/');
  for (const entry of actualArchiveEntries) {
    if (!allowedPackedPath(entry)) throw new Error(`Packed tar archive contains an unexpected entry: ${entry}`);
  }
  for (const required of [
    'LICENSE',
    'README.md',
    'CONTRIBUTING.md',
    'SECURITY.md',
    'THIRD_PARTY_NOTICES.md',
    'dist/cli.js',
    'docs/approved-specification.md',
    'docs/phases/phase-5.md',
    'templates/skills/catalog.json',
    'templates/skills/ask-matt/upstream/SKILL.md',
  ]) {
    if (!includedPaths.has(required)) throw new Error(`Packed file manifest is missing ${required}.`);
    if (!actualArchiveEntries.has(required)) throw new Error(`Packed tar archive is missing ${required}.`);
  }

  await execa('npm', ['install', '--ignore-scripts', '--dry-run=false', '--prefix', installDirectory, tarball], {
    env: packEnvironment,
  });
  const cli = process.platform === 'win32'
    ? path.join(installDirectory, 'node_modules/.bin/agent-orchestration-kit.cmd')
    : path.join(installDirectory, 'node_modules/.bin/agent-orchestration-kit');
  const run = async (
    arguments_: readonly string[],
    extraEnvironment: NodeJS.ProcessEnv = {},
    cwd?: string,
  ) => execa(cli, arguments_, {
    ...(cwd === undefined ? {} : { cwd }),
    env: {
      ...process.env,
      ...extraEnvironment,
      PATH: `${fakeBinDirectory}${path.delimiter}${process.env['PATH'] ?? ''}`,
      AOK_ORCA_REPO: cwd ?? arguments_[1] ?? '',
    },
  });

  for (const profile of profiles) {
    const targetRepository = repositories.get(profile);
    if (targetRepository === undefined) throw new Error(`Missing packed smoke repository for ${profile}.`);
    await execa('git', ['-C', targetRepository, 'init', '--quiet', '-b', 'main']);
    await execa('git', [
      '-C', targetRepository, 'remote', 'add', 'origin',
      `git@github.com:DYEWolf/agent-orchestration-kit-packed-smoke-${profile}.git`,
    ]);
    const preseededAgents = '# Existing CRLF instructions\r\n\r\nKeep this user-owned line.\r\n';
    await writeFile(path.join(targetRepository, 'AGENTS.md'), preseededAgents, 'utf8');
    const fakeState = path.join(temporary, `github-state-${profile}`);
    const fakeLog = path.join(temporary, `github-log-${profile}`);
    await writeFile(fakeLog, '', 'utf8');
    const fakeGitHubEnvironment = { AOK_GH_STATE: fakeState, AOK_GH_LOG: fakeLog };

    if (profile === 'codex-only') {
      const defaultPathDryRun = JSON.parse((await run([
        'init', '--dry-run', '--json',
      ], fakeGitHubEnvironment, targetRepository)).stdout) as { canApply: boolean };
      if (!defaultPathDryRun.canApply) throw new Error('Packed default-path quickstart dry-run failed.');
      if (await readFile(path.join(targetRepository, 'AGENTS.md'), 'utf8') !== preseededAgents) throw new Error('Packed default-path quickstart dry-run changed CRLF content.');
    }

    const dryRun = JSON.parse((await run([
      'init', targetRepository, '--profile', profile, '--dry-run', '--json',
    ], fakeGitHubEnvironment)).stdout) as { summary: { create: number; update: number }; canApply: boolean; githubLabelMutations: { state: string }[] };
    if (await readFile(path.join(targetRepository, 'AGENTS.md'), 'utf8') !== preseededAgents) throw new Error(`Packed dry-run changed CRLF content for ${profile}.`);
    if (!dryRun.canApply || dryRun.summary.create < 60 || dryRun.githubLabelMutations[0]?.state !== 'planned') throw new Error(`Packed dry-run failed for ${profile}.`);
    if ((await readFile(fakeLog, 'utf8')).split('\n').filter((line) => line === 'create').length !== 0) throw new Error(`Packed dry-run executed GitHub label mutation for ${profile}.`);

    const first = JSON.parse((await run([
      'init', targetRepository, '--profile', profile, '--yes', '--json',
    ], fakeGitHubEnvironment)).stdout) as { receipt: { applied: boolean; written: string[]; verified: boolean; githubActions: { id: string; status: string }[] } };
    const agentsAfterFirst = await readFile(path.join(targetRepository, 'AGENTS.md'), 'utf8');
    if (!agentsAfterFirst.startsWith(preseededAgents) || !agentsAfterFirst.includes('<!-- agent-orchestration-kit:start version="1" -->\n')) {
      throw new Error(`Packed first init did not preserve/normalize CRLF-owned AGENTS.md content for ${profile}.`);
    }
    if (agentsAfterFirst.slice(preseededAgents.length).includes('\r')) throw new Error(`Packed generated AGENTS.md block was not normalized to LF for ${profile}.`);
    if (!first.receipt.applied || !first.receipt.verified || first.receipt.written.length !== dryRun.summary.create + dryRun.summary.update || first.receipt.githubActions.length !== 1 || first.receipt.githubActions[0]?.status !== 'executed') {
      throw new Error(`Packed first init failed for ${profile}.`);
    }

    const second = JSON.parse((await run([
      'init', targetRepository, '--profile', profile, '--yes', '--json',
    ], fakeGitHubEnvironment)).stdout) as { receipt: { applied: boolean; written: string[]; githubActions: { id: string; status: string }[] } };
    const agentsAfterSecond = await readFile(path.join(targetRepository, 'AGENTS.md'), 'utf8');
    if (second.receipt.applied || second.receipt.written.length !== 0 || second.receipt.githubActions.length !== 0 || agentsAfterSecond !== agentsAfterFirst) throw new Error(`Packed second init was not an exact no-op for ${profile}.`);
    if ((await readFile(fakeLog, 'utf8')).split('\n').filter((line) => line === 'create').length !== 1) throw new Error(`Packed GitHub label creation was not exactly once for ${profile}.`);

    const doctor = JSON.parse((await run(['doctor', targetRepository, '--json'], fakeGitHubEnvironment)).stdout) as {
      healthy: boolean;
      summary: { FAIL: number };
    };
    const diff = JSON.parse((await run(['diff', targetRepository, '--json'], fakeGitHubEnvironment)).stdout) as { clean: boolean };
    if (!doctor.healthy || doctor.summary.FAIL !== 0) throw new Error(`Packed doctor failed for ${profile}.`);
    if (!diff.clean) throw new Error(`Packed diff was not clean for ${profile}.`);
  }

  process.stdout.write(`Packed CLI smoke test passed for ${profiles.length} profiles; archive entries, .bin execution, CRLF preservation, and exact no-op/GitHub lifecycle verified.\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
