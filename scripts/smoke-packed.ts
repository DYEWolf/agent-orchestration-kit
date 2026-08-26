import path from 'node:path';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';

interface PackResult {
  readonly filename: string;
  readonly files: readonly { path: string }[];
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(path.join(tmpdir(), 'orca-kit-packed-smoke-'));

try {
  const packageDirectory = path.join(temporary, 'package');
  const installDirectory = path.join(temporary, 'install');
  const targetRepository = path.join(temporary, 'repository');
  await Promise.all([
    mkdir(packageDirectory),
    mkdir(installDirectory),
    mkdir(targetRepository),
  ]);

  const packed = await execa('npm', [
    'pack',
    '--ignore-scripts',
    '--json',
    '--pack-destination',
    packageDirectory,
  ], { cwd: repositoryRoot });
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
  await execa('npm', ['install', '--ignore-scripts', '--prefix', installDirectory, tarball]);
  await execa('git', ['-C', targetRepository, 'init', '--quiet', '-b', 'main']);
  await execa('git', [
    '-C', targetRepository, 'remote', 'add', 'origin',
    'git@github.com:DYEWolf/orca-kit-packed-smoke.git',
  ]);

  const cli = path.join(installDirectory, 'node_modules/@dyewolf/orca-kit/dist/cli.js');
  const run = async (arguments_: readonly string[]) => execa('node', [cli, ...arguments_]);
  const dryRun = JSON.parse((await run([
    'init', targetRepository, '--profile', 'codex-only', '--dry-run', '--json',
  ])).stdout) as { summary: { create: number }; canApply: boolean };
  const first = JSON.parse((await run([
    'init', targetRepository, '--profile', 'codex-only', '--yes', '--json',
  ])).stdout) as { receipt: { applied: boolean; written: string[]; verified: boolean } };
  const second = JSON.parse((await run([
    'init', targetRepository, '--profile', 'codex-only', '--yes', '--json',
  ])).stdout) as { receipt: { applied: boolean; written: string[] } };
  const doctor = JSON.parse((await run(['doctor', targetRepository, '--json'])).stdout) as {
    healthy: boolean;
    summary: { FAIL: number };
  };
  const diff = JSON.parse((await run(['diff', targetRepository, '--json'])).stdout) as { clean: boolean };

  if (!dryRun.canApply || dryRun.summary.create < 60) throw new Error('Packed dry-run did not plan a complete installation.');
  if (!first.receipt.applied || !first.receipt.verified || first.receipt.written.length !== dryRun.summary.create) {
    throw new Error('Packed first init did not apply and verify the complete plan.');
  }
  if (second.receipt.applied || second.receipt.written.length !== 0) throw new Error('Packed second init was not a no-op.');
  if (!doctor.healthy || doctor.summary.FAIL !== 0) throw new Error('Packed doctor did not report a healthy local installation.');
  if (!diff.clean) throw new Error('Packed diff did not report a clean installation.');

  process.stdout.write(`Packed CLI smoke test passed with ${first.receipt.written.length} installed artifacts.\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
