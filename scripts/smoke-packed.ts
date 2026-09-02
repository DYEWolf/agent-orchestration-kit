import path from 'node:path';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';

interface PackResult {
  readonly filename: string;
  readonly files: readonly { path: string }[];
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(path.join(tmpdir(), 'orca-kit-packed-smoke-'));
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
  await writeFile(fakeClaude, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--version') process.stdout.write('2.1.236\\n');
else if (args.length === 3 && args[0] === 'auth' && args[1] === 'status' && args[2] === '--json') process.stdout.write('{"loggedIn":true}\\n');
else process.exit(4);
`, { encoding: 'utf8', mode: 0o755 });
  await chmod(fakeClaude, 0o755);

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
  const cli = path.join(installDirectory, 'node_modules/@dyewolf/orca-kit/dist/cli.js');
  const run = async (arguments_: readonly string[]) => execa('node', [cli, ...arguments_], {
    env: {
      ...process.env,
      PATH: `${fakeBinDirectory}${path.delimiter}${process.env['PATH'] ?? ''}`,
    },
  });

  for (const profile of profiles) {
    const targetRepository = path.join(temporary, `repository-${profile}`);
    await execa('git', ['-C', targetRepository, 'init', '--quiet', '-b', 'main']);
    await execa('git', [
      '-C', targetRepository, 'remote', 'add', 'origin',
      `git@github.com:DYEWolf/orca-kit-packed-smoke-${profile}.git`,
    ]);

    const dryRun = JSON.parse((await run([
      'init', targetRepository, '--profile', profile, '--dry-run', '--json',
    ])).stdout) as { summary: { create: number }; canApply: boolean };
    const first = JSON.parse((await run([
      'init', targetRepository, '--profile', profile, '--yes', '--json',
    ])).stdout) as { receipt: { applied: boolean; written: string[]; verified: boolean } };
    const second = JSON.parse((await run([
      'init', targetRepository, '--profile', profile, '--yes', '--json',
    ])).stdout) as { receipt: { applied: boolean; written: string[] } };
    const doctor = JSON.parse((await run(['doctor', targetRepository, '--json'])).stdout) as {
      healthy: boolean;
      summary: { FAIL: number };
    };
    const diff = JSON.parse((await run(['diff', targetRepository, '--json'])).stdout) as { clean: boolean };

    if (!dryRun.canApply || dryRun.summary.create < 60) throw new Error(`Packed dry-run failed for ${profile}.`);
    if (!first.receipt.applied || !first.receipt.verified || first.receipt.written.length !== dryRun.summary.create) {
      throw new Error(`Packed first init failed for ${profile}.`);
    }
    if (second.receipt.applied || second.receipt.written.length !== 0) throw new Error(`Packed second init was not a no-op for ${profile}.`);
    if (!doctor.healthy || doctor.summary.FAIL !== 0) throw new Error(`Packed doctor failed for ${profile}.`);
    if (!diff.clean) throw new Error(`Packed diff was not clean for ${profile}.`);
  }

  process.stdout.write(`Packed CLI smoke test passed for ${profiles.length} profiles.\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
