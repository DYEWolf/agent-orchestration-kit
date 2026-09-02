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

try {
  const packageDirectory = path.join(temporary, 'package');
  const installDirectory = path.join(temporary, 'install');
  const fakeBinDirectory = path.join(temporary, 'fake-bin');
  const profiles = ['codex-only', 'claude-coordinator', 'claude-only', 'codex-coordinator'] as const;
  await Promise.all([
    mkdir(packageDirectory),
    mkdir(installDirectory),
    mkdir(fakeBinDirectory),
    ...profiles.map((profile) => mkdir(path.join(temporary, `repository-${profile}`))),
  ]);
  const fakeClaude = path.join(fakeBinDirectory, 'claude');
  const fakeOrca = path.join(fakeBinDirectory, 'orca');
  const fakeGh = path.join(fakeBinDirectory, 'gh');
  await writeFile(fakeClaude, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--version') process.stdout.write('2.1.236\\n');
else if (args.length === 3 && args[0] === 'auth' && args[1] === 'status' && args[2] === '--json') process.stdout.write('{"loggedIn":true}\\n');
else process.exit(4);
`, { encoding: 'utf8', mode: 0o755 });
  await chmod(fakeClaude, 0o755);
  await writeFile(fakeOrca, `#!/usr/bin/env node
const args = process.argv.slice(2).join(' ');
const emit = (result) => process.stdout.write(\`${'${JSON.stringify({ ok: true, result })}'}\\n\`);
const commands = [['agent-context', ['json']], ['status', ['json']], ['skills installed', ['json']], ['repo list', ['json']], ['skills install', ['skill', 'dry-run']], ['repo add', ['path']]].map(([command, flags]) => ({ path: command.split(' '), flags, argumentMode: 'parsed' }));
if (args === 'agent-context --json') process.stdout.write(\`${'${JSON.stringify({ schemaVersion: 1, commandCount: commands.length, commands })}'}\\n\`);
else if (args === 'status --json') emit({ runtime: { state: 'ready', reachable: true, appVersion: '1.4.190', capabilities: ['runtime.status.compat.v1', 'orchestration.contract.v1'] }, graph: { state: 'ready' } });
else if (args === 'skills installed --json') emit({ skills: [{ name: 'orchestration' }] });
else if (args === 'repo list --json') emit({ repos: [{ path: process.env.AOK_ORCA_REPO }] });
else if (args === 'skills install --skill orchestration' || args.startsWith('repo add --path ')) process.exit(0);
else process.exit(9);
`, { encoding: 'utf8', mode: 0o755 });
  await chmod(fakeOrca, 0o755);
  await writeFile(fakeGh, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const query = args.find((arg) => arg.startsWith('query='))?.slice('query='.length) || '';
const values = [];
for (let cursor = 0; cursor < args.length; cursor += 1) if (args[cursor] === '-f') values.push(args[cursor + 1]);
const valueFor = (name) => values.find((value) => value?.startsWith(name + '='))?.slice(name.length + 1);
const emit = (value) => process.stdout.write(\`${'${JSON.stringify(value)}'}\\n\`);
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
  process.exit(0);
}
else process.exit(9);
`, { encoding: 'utf8', mode: 0o755 });
  await chmod(fakeGh, 0o755);

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
  for (const required of [
    'LICENSE',
    'README.md',
    'THIRD_PARTY_NOTICES.md',
    'dist/cli.js',
    'templates/skills/catalog.json',
    'templates/skills/ask-matt/upstream/SKILL.md',
  ]) {
    if (!includedPaths.has(required)) throw new Error(`Packed tarball is missing ${required}.`);
  }

  const tarball = path.join(packageDirectory, packResult.filename);
  await execa('npm', ['install', '--ignore-scripts', '--dry-run=false', '--prefix', installDirectory, tarball], {
    env: packEnvironment,
  });
  const cli = path.join(installDirectory, 'node_modules/@dyewolf/agent-orchestration-kit/dist/cli.js');
  const run = async (arguments_: readonly string[], extraEnvironment: NodeJS.ProcessEnv = {}) => execa('node', [cli, ...arguments_], {
    env: {
      ...process.env,
      ...extraEnvironment,
      PATH: `${fakeBinDirectory}${path.delimiter}${process.env['PATH'] ?? ''}`,
      AOK_ORCA_REPO: arguments_[1] ?? '',
    },
  });

  for (const profile of profiles) {
    const targetRepository = path.join(temporary, `repository-${profile}`);
    await execa('git', ['-C', targetRepository, 'init', '--quiet', '-b', 'main']);
    await execa('git', [
      '-C', targetRepository, 'remote', 'add', 'origin',
      `git@github.com:DYEWolf/agent-orchestration-kit-packed-smoke-${profile}.git`,
    ]);
    const fakeState = path.join(temporary, `github-state-${profile}`);
    const fakeLog = path.join(temporary, `github-log-${profile}`);
    await writeFile(fakeLog, '');
    const fakeGitHubEnvironment = { AOK_GH_STATE: fakeState, AOK_GH_LOG: fakeLog };

    const dryRun = JSON.parse((await run([
      'init', targetRepository, '--profile', profile, '--dry-run', '--json',
    ], fakeGitHubEnvironment)).stdout) as { summary: { create: number }; canApply: boolean; githubLabelMutations: { state: string }[] };
    const first = JSON.parse((await run([
      'init', targetRepository, '--profile', profile, '--yes', '--json',
    ], fakeGitHubEnvironment)).stdout) as { receipt: { applied: boolean; written: string[]; verified: boolean; githubActions: { id: string; status: string }[] } };
    const second = JSON.parse((await run([
      'init', targetRepository, '--profile', profile, '--yes', '--json',
    ], fakeGitHubEnvironment)).stdout) as { receipt: { applied: boolean; written: string[]; githubActions: { id: string; status: string }[] } };
    const doctor = JSON.parse((await run(['doctor', targetRepository, '--json'], fakeGitHubEnvironment)).stdout) as {
      healthy: boolean;
      summary: { FAIL: number };
    };
    const diff = JSON.parse((await run(['diff', targetRepository, '--json'], fakeGitHubEnvironment)).stdout) as { clean: boolean };

    if (!dryRun.canApply || dryRun.summary.create < 60 || dryRun.githubLabelMutations[0]?.state !== 'planned') throw new Error(`Packed dry-run failed for ${profile}.`);
    if (!first.receipt.applied || !first.receipt.verified || first.receipt.written.length !== dryRun.summary.create || first.receipt.githubActions.length !== 1 || first.receipt.githubActions[0]?.status !== 'executed') {
      throw new Error(`Packed first init failed for ${profile}.`);
    }
    if (second.receipt.applied || second.receipt.written.length !== 0 || second.receipt.githubActions.length !== 0) throw new Error(`Packed second init was not a no-op for ${profile}.`);
    if ((await readFile(fakeLog, 'utf8')).split('\n').filter((line) => line === 'create').length !== 1) throw new Error(`Packed GitHub label creation was not exactly once for ${profile}.`);
    if (!doctor.healthy || doctor.summary.FAIL !== 0) throw new Error(`Packed doctor failed for ${profile}.`);
    if (!diff.clean) throw new Error(`Packed diff was not clean for ${profile}.`);
  }

  process.stdout.write(`Packed CLI smoke test passed for ${profiles.length} profiles.\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
