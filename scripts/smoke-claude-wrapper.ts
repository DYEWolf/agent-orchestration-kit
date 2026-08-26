import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execa } from 'execa';
import { NodeHarnessAdapter } from '../src/adapters/harness/node-harness.js';

const SENTINEL = 'ORCA_CANONICAL_BODY_8D2F6A';
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const probeArguments = [
  '-p',
  'Invoke the /tdd skill, read its canonical body, and reply with the exact live wrapper smoke token from that body and nothing else.',
  '--model',
  'sonnet',
  '--effort',
  'low',
  '--tools',
  'Read',
  '--permission-mode',
  'dontAsk',
  '--setting-sources',
  'project',
  '--no-session-persistence',
  '--output-format',
  'json',
] as const;

interface JsonObject {
  readonly [key: string]: unknown;
}

interface ProbeResult {
  readonly kind: 'success' | 'environment-or-auth-failure' | 'wrapper-discovery-mismatch';
  readonly output?: string;
}

class SmokeFailure extends Error {
  public constructor(
    readonly category: 'environment-or-auth' | 'wrapper-discovery',
    message: string,
  ) {
    super(message);
    this.name = 'SmokeFailure';
  }
}

async function main(): Promise<void> {
  if (!process.argv.slice(2).includes('--live')) {
    process.stdout.write('Claude live smoke is opt-in; run `npm run smoke:claude` to authorize it.\n');
    process.exitCode = 2;
    return;
  }

  const temporary = await mkdtemp(path.join(tmpdir(), 'orca-kit-claude-smoke-'));
  try {
    const fixture = path.join(temporary, 'fixture');
    await mkdir(fixture, { recursive: true });
    await execa('git', ['-C', fixture, 'init', '--quiet', '-b', 'main']);
    await execa('git', ['-C', fixture, 'remote', 'add', 'origin', 'git@github.com:DYEWolf/orca-kit-claude-smoke.git']);

    const init = await execa('node', [
      '--import',
      'tsx',
      path.join(repositoryRoot, 'src/cli.ts'),
      'init',
      fixture,
      '--profile',
      'claude-coordinator',
      '--yes',
      '--json',
    ], { cwd: repositoryRoot, reject: false, stdin: 'ignore' });
    if (init.failed || init.exitCode !== 0) {
      throw new SmokeFailure('environment-or-auth', 'Could not create the fresh Claude-profile fixture.');
    }

    const canonicalPath = path.join(fixture, '.agents/skills/tdd/SKILL.md');
    await writeFile(
      canonicalPath,
      `${await readFile(canonicalPath, 'utf8')}\n\nLive wrapper smoke token: ${SENTINEL}\n`,
      'utf8',
    );
    const wrapper = await readFile(path.join(fixture, '.claude/skills/tdd/SKILL.md'), 'utf8');
    if (wrapper.includes(SENTINEL)) {
      throw new SmokeFailure('wrapper-discovery', 'The live smoke sentinel must exist only in the canonical skill body.');
    }

    const capability = await new NodeHarnessAdapter().checkClaude();
    const testedVersion = capability.version.version ?? 'unknown';
    if (capability.cli.status !== 'pass' || capability.version.status !== 'pass' || capability.authentication.status !== 'pass') {
      throw new SmokeFailure(
        'environment-or-auth',
        `Claude environment/auth checks did not pass (tested version ${testedVersion}; ${failureReason(capability)}).`,
      );
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const probe = await runProbe(fixture);
      if (probe.kind === 'environment-or-auth-failure') {
        throw new SmokeFailure('environment-or-auth', `Claude inference session ${attempt + 1} failed before a successful response.`);
      }
      if (probe.kind === 'wrapper-discovery-mismatch') {
        throw new SmokeFailure('wrapper-discovery', `Claude inference succeeded but session ${attempt + 1} did not return the exact canonical token.`);
      }
    }

    process.stdout.write(`Claude wrapper smoke passed in 3 fresh sessions; tested Claude Code version ${testedVersion}.\n`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function runProbe(fixture: string): Promise<ProbeResult> {
  const result = await execa('claude', probeArguments, {
    cwd: fixture,
    reject: false,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'ignore',
    timeout: 180_000,
  });
  if (result.failed || result.exitCode !== 0) return { kind: 'environment-or-auth-failure' };
  const parsed = parseJsonObject(result.stdout);
  if (parsed === undefined || isErrorResult(parsed)) return { kind: 'environment-or-auth-failure' };
  const output = extractProbeOutput(parsed);
  if (output === undefined || output !== SENTINEL) return { kind: 'wrapper-discovery-mismatch' };
  return { kind: 'success', output };
}

function parseJsonObject(output: string): JsonObject | undefined {
  try {
    const value: unknown = JSON.parse(output);
    return isJsonObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function extractProbeOutput(result: JsonObject): string | undefined {
  const value = result['result'] ?? result['output'];
  return typeof value === 'string' ? value.trim() : undefined;
}

function isErrorResult(result: JsonObject): boolean {
  return result['is_error'] === true
    || result['isError'] === true
    || result['type'] === 'error'
    || result['subtype'] === 'error';
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failureReason(report: Awaited<ReturnType<NodeHarnessAdapter['checkClaude']>>): string {
  if (report.cli.status !== 'pass') return `CLI ${report.cli.reason ?? 'check failed'}`;
  if (report.version.status !== 'pass') return `version ${report.version.reason ?? 'check failed'}`;
  return `authentication ${report.authentication.reason ?? 'check failed'}`;
}

main().catch((error: unknown) => {
  if (error instanceof SmokeFailure) {
    process.stdout.write(`Claude live smoke ${error.category} failure: ${error.message}\n`);
  } else {
    process.stdout.write('Claude live smoke environment/auth failure: an unexpected local command failed.\n');
  }
  process.exitCode = 1;
});
