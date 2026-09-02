import path from 'node:path';
import { readFile, realpath } from 'node:fs/promises';
import { execa } from 'execa';
import {
  ORCA_MINIMUM_VERSION,
  compareOrcaVersions,
  type OrcaAction,
  type OrcaActionReceipt,
  type OrcaAdapter,
  type OrcaCheck,
  type OrcaDiscovery,
} from './orca.js';

export interface NodeOrcaAdapterOptions {
  /** The executable is injectable so tests can use a deterministic fake process. */
  readonly executable?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
}

type CommandResult =
  | { readonly kind: 'success'; readonly value: unknown }
  | { readonly kind: 'missing' | 'failed' | 'timeout' | 'malformed' };

type CommandSpec = { readonly path: readonly string[]; readonly flags: readonly string[] };

interface OrcaObservation {
  readonly check: OrcaCheck;
  readonly available: boolean;
}

const requiredCommands: readonly CommandSpec[] = [
  { path: ['agent-context'], flags: ['json'] },
  { path: ['status'], flags: ['json'] },
  { path: ['skills', 'installed'], flags: ['json'] },
  { path: ['repo', 'list'], flags: ['json'] },
  { path: ['skills', 'install'], flags: ['skill', 'dry-run'] },
  { path: ['repo', 'add'], flags: ['path'] },
];

const requiredCapabilities = ['runtime.status.compat.v1', 'orchestration.contract.v1'] as const;

/**
 * Process boundary for the small, versioned Orca contract. Process output is
 * parsed only for the documented fields and is never copied into diagnostics.
 */
export class NodeOrcaAdapter implements OrcaAdapter {
  readonly #executable: string;
  readonly #env: NodeJS.ProcessEnv | undefined;
  readonly #timeoutMs: number;

  public constructor(options: NodeOrcaAdapterOptions = {}) {
    this.#executable = options.executable ?? 'orca';
    this.#env = options.env;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
  }

  public async discover(repositoryRoot: string): Promise<OrcaDiscovery> {
    const repositoryTarget = await resolveOrcaRepositoryTarget(repositoryRoot);
    const context = await this.runJson(['agent-context', '--json']);
    if (context.kind !== 'success') return unavailable('agent-context', context.kind, undefined, repositoryTarget);

    const registry = commandRegistry(context.value);
    if (registry.error !== undefined) return unavailable('agent-context', 'malformed', registry.error, repositoryTarget);
    if (registry.requiredError !== undefined) {
      return commandCompatibilityFailure(registry.requiredError, repositoryTarget);
    }

    const missing = requiredCommands.find((required) => !registry.commands.some((actual) =>
      sameArray(actual.path, required.path)
      && required.flags.every((flag) => actual.flags.includes(flag)),
    ));
    if (missing !== undefined) {
      return commandCompatibilityFailure(
        `Orca command registry is missing ${missing.path.join(' ')} with required flag(s): ${missing.flags.join(', ')}`,
        repositoryTarget,
      );
    }

    const status = await this.runJson(['status', '--json']);
    if (status.kind !== 'success') return statusFailure(status.kind, undefined, repositoryTarget);

    const statusPayload = envelopeResult(status.value);
    if (statusPayload === undefined) return statusFailure('malformed', undefined, repositoryTarget);
    const runtime = statusRuntime(statusPayload);
    if (runtime.error !== undefined) return statusFailure('malformed', runtime.error, repositoryTarget);

    const versionComparison = compareOrcaVersions(runtime.value.appVersion, ORCA_MINIMUM_VERSION);
    const missingCapabilityName = missingCapability(runtime.value.capabilities);
    const compatibility = versionComparison === undefined
      ? fail('Orca status runtime.appVersion is malformed; expected a semantic version such as 1.4.190.')
      : versionComparison < 0
        ? fail(`Orca ${runtime.value.appVersion} is below the minimum supported version ${ORCA_MINIMUM_VERSION}.`)
        : missingCapabilityName === undefined
          ? pass(`Orca ${runtime.value.appVersion} meets compatibility requirements.`)
          : fail(`Orca status is missing required runtime capability ${missingCapabilityName}.`);
    const readiness = readinessCheck(runtime.value);

    // Skills and registration are intentionally independent probes. Once the
    // core CLI, version/capability contract, and readiness pass, one failed
    // read must not prevent the other action from being offered.
    if (compatibility.status === 'fail' || readiness.status === 'fail') {
      const reason = compatibility.status === 'fail' ? 'compatibility failed' : 'readiness failed';
      return {
        cli: pass('Orca CLI is present and exposes the required command registry.'),
        compatibility,
        readiness,
        globalSkill: skip(`Global orchestration skill was not checked because Orca ${reason}.`),
        repository: skip(`Repository registration was not checked because Orca ${reason}.`),
        ...(repositoryTarget === undefined ? {} : { repositoryTarget }),
        canInstallSkill: false,
        canRegisterRepository: false,
      };
    }

    const [globalSkill, repository] = await Promise.all([
      this.discoverGlobalSkill(),
      this.discoverRepository(repositoryTarget),
    ]);
    return {
      cli: pass('Orca CLI is present and exposes the required command registry.'),
      compatibility,
      readiness,
      globalSkill: globalSkill.check,
      repository: repository.check,
      ...(repositoryTarget === undefined ? {} : { repositoryTarget }),
      canInstallSkill: globalSkill.available,
      canRegisterRepository: repository.available,
    };
  }

  public async execute(action: OrcaAction): Promise<OrcaActionReceipt> {
    const label = actionLabel(action.id);
    try {
      const result = await execa(this.#executable, action.argv, {
        ...(this.#env === undefined ? {} : { env: this.#env }),
        reject: false,
        stdin: 'ignore',
        stdout: 'ignore',
        stderr: 'ignore',
        timeout: this.#timeoutMs,
      });
      if (isTimedOut(result)) return { id: action.id, status: 'failed', message: `Orca ${label} timed out.` };
      if (isMissingProcess(result)) return { id: action.id, status: 'failed', message: `Orca ${label} could not be found on PATH.` };
      return result.failed || result.exitCode !== 0
        ? { id: action.id, status: 'failed', message: `Orca ${label} failed.` }
        : { id: action.id, status: 'executed', message: `Orca ${label} completed.` };
    } catch (error) {
      return {
        id: action.id,
        status: 'failed',
        message: isTimeoutError(error) ? `Orca ${label} timed out.` : `Orca ${label} could not be executed.`,
      };
    }
  }

  private async discoverGlobalSkill(): Promise<OrcaObservation> {
    const result = await this.runJson(['skills', 'installed', '--json']);
    if (result.kind !== 'success') return unavailableObservation(readFailure('skills installed', result.kind));
    const payload = envelopeResult(result.value);
    if (payload === undefined) return unavailableObservation(malformedRead('skills installed'));
    const names = installedSkills(payload);
    if (names.error !== undefined) return unavailableObservation(fail(`Orca skills installed result ${names.error}.`));
    return availableObservation(names.value.includes('orchestration')
      ? pass('Global Orca skill orchestration is installed.')
      : fail('Global Orca skill orchestration is not installed.'));
  }

  private async discoverRepository(repositoryTarget: string | undefined): Promise<OrcaObservation> {
    const result = await this.runJson(['repo', 'list', '--json']);
    if (result.kind !== 'success') return unavailableObservation(readFailure('repo list', result.kind));
    const payload = envelopeResult(result.value);
    if (payload === undefined) return unavailableObservation(malformedRead('repo list'));
    const listed = repositoryPaths(payload);
    if (listed.error !== undefined) return unavailableObservation(fail(`Orca repo list result ${listed.error}.`));

    if (repositoryTarget === undefined) {
      return unavailableObservation(fail('Orca repository path could not be resolved for registration checking.'));
    }

    const canonicalRepos = await Promise.all(listed.value.map(async (candidate) => {
      try {
        return await realpath(candidate);
      } catch {
        // A stale/deleted candidate is simply not a match. It must not make
        // the whole read probe throw or allow metadata to count as identity.
        return undefined;
      }
    }));
    return availableObservation(canonicalRepos.some((candidate) => candidate !== undefined && candidate === repositoryTarget)
      ? pass('Repository is registered with Orca by canonical path.')
      : fail('Repository is not registered with Orca by canonical path.'));
  }

  private async runJson(argv: readonly string[]): Promise<CommandResult> {
    try {
      const result = await execa(this.#executable, argv, {
        ...(this.#env === undefined ? {} : { env: this.#env }),
        reject: false,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'ignore',
        timeout: this.#timeoutMs,
      });
      if (isMissingProcess(result)) return { kind: 'missing' };
      if (isTimedOut(result)) return { kind: 'timeout' };
      if (result.failed || result.exitCode !== 0) return { kind: 'failed' };
      try {
        return { kind: 'success', value: JSON.parse(typeof result.stdout === 'string' ? result.stdout : '') as unknown };
      } catch {
        return { kind: 'malformed' };
      }
    } catch (error) {
      if (isMissingError(error)) return { kind: 'missing' };
      if (isTimeoutError(error)) return { kind: 'timeout' };
      return { kind: 'failed' };
    }
  }
}

const pass = (message: string): OrcaCheck => ({ status: 'pass', message });
const fail = (message: string): OrcaCheck => ({ status: 'fail', message });
const skip = (message: string): OrcaCheck => ({ status: 'skip', message });
const availableObservation = (check: OrcaCheck): OrcaObservation => ({ check, available: true });
const unavailableObservation = (check: OrcaCheck): OrcaObservation => ({ check, available: false });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameArray(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function commandRegistry(value: unknown):
  | { readonly commands: { path: string[]; flags: string[] }[]; readonly requiredError?: string; readonly error?: undefined }
  | { readonly commands?: undefined; readonly requiredError?: undefined; readonly error: string } {
  if (!isRecord(value)) return { error: 'is not an object' };
  if (value['schemaVersion'] !== 1) return { error: 'has unsupported schemaVersion; expected 1' };
  if (!Number.isSafeInteger(value['commandCount'])) return { error: 'is missing a valid commandCount' };
  if (!Array.isArray(value['commands'])) return { error: 'is missing a commands array' };
  if (value['commandCount'] !== value['commands'].length) return { error: 'has a commandCount that does not match commands' };

  const commands: { path: string[]; flags: string[] }[] = [];
  for (const command of value['commands']) {
    if (!isRecord(command) || !Array.isArray(command['path']) || !command['path'].every((item) => typeof item === 'string')) continue;
    const commandPath = command['path'] as string[];
    const required = requiredCommands.find((candidate) => sameArray(candidate.path, commandPath));
    if (required === undefined) continue;
    if (!Array.isArray(command['flags']) || !command['flags'].every((item) => typeof item === 'string')) {
      return { commands: [], requiredError: `${required.path.join(' ')} has malformed flags` };
    }
    commands.push({ path: commandPath, flags: command['flags'] as string[] });
  }
  return { commands };
}

function envelopeResult(value: unknown): unknown | undefined {
  return isRecord(value) && value['ok'] === true && 'result' in value ? value['result'] : undefined;
}

function statusRuntime(value: unknown):
  | { readonly value: { state: string; reachable: boolean; appVersion: string; capabilities: string[]; graphState: string }; readonly error?: undefined }
  | { readonly value?: undefined; readonly error: string } {
  if (!isRecord(value)) return { error: 'result is not an object' };
  if (!isRecord(value['runtime'])) return { error: 'result is missing runtime' };
  if (!isRecord(value['graph'])) return { error: 'result is missing graph' };
  const runtime = value['runtime']; const graph = value['graph'];
  if (typeof runtime['state'] !== 'string') return { error: 'result is missing runtime.state' };
  if (typeof runtime['reachable'] !== 'boolean') return { error: 'result is missing runtime.reachable' };
  if (typeof runtime['appVersion'] !== 'string') return { error: 'result is missing runtime.appVersion' };
  if (!Array.isArray(runtime['capabilities']) || !runtime['capabilities'].every((item) => typeof item === 'string')) {
    return { error: 'result is missing runtime.capabilities' };
  }
  if (typeof graph['state'] !== 'string') return { error: 'result is missing graph.state' };
  return {
    value: {
      state: runtime['state'],
      reachable: runtime['reachable'],
      appVersion: runtime['appVersion'],
      capabilities: runtime['capabilities'] as string[],
      graphState: graph['state'],
    },
  };
}

function installedSkills(value: unknown):
  | { readonly value: string[]; readonly error?: undefined }
  | { readonly value?: undefined; readonly error: string } {
  if (!isRecord(value) || !Array.isArray(value['skills'])) return { error: 'is missing a skills array' };
  const names: string[] = [];
  for (const skill of value['skills']) {
    if (!isRecord(skill) || typeof skill['name'] !== 'string') return { error: 'contains a skill with a malformed name' };
    names.push(skill['name']);
  }
  return { value: names };
}

function repositoryPaths(value: unknown):
  | { readonly value: string[]; readonly error?: undefined }
  | { readonly value?: undefined; readonly error: string } {
  if (!isRecord(value) || !Array.isArray(value['repos'])) return { error: 'is missing a repos array' };
  const paths: string[] = [];
  for (const repo of value['repos']) {
    if (!isRecord(repo) || typeof repo['path'] !== 'string') return { error: 'contains a repository with a malformed path' };
    paths.push(repo['path']);
  }
  return { value: paths };
}

export async function resolveOrcaRepositoryTarget(repositoryRoot: string): Promise<string | undefined> {
  let canonicalRoot: string;
  try {
    canonicalRoot = await realpath(repositoryRoot);
  } catch {
    return undefined;
  }
  try {
    const gitFile = await readFile(path.join(repositoryRoot, '.git'), 'utf8');
    const match = /^\s*gitdir:\s*(.+?)\s*$/mu.exec(gitFile);
    if (match === null) return canonicalRoot;
    const gitDirectory = path.resolve(repositoryRoot, match[1]!);
    const marker = `${path.sep}worktrees${path.sep}`;
    const markerIndex = gitDirectory.lastIndexOf(marker);
    if (markerIndex < 0) return canonicalRoot;
    const commonGitDirectory = gitDirectory.slice(0, markerIndex);
    const commonRoot = path.dirname(commonGitDirectory);
    return await realpath(commonRoot);
  } catch {
    // A normal repository has a .git directory, and a malformed worktree
    // pointer is not a reason to fail the ordinary canonical-root check.
  }
  return canonicalRoot;
}

function missingCapability(capabilities: readonly string[]): string | undefined {
  return requiredCapabilities.find((capability) => !capabilities.includes(capability));
}

function readinessCheck(runtime: { state: string; reachable: boolean; graphState: string }): OrcaCheck {
  const missing: string[] = [];
  if (runtime.state !== 'ready') missing.push('runtime.state=ready');
  if (!runtime.reachable) missing.push('runtime.reachable=true');
  if (runtime.graphState !== 'ready') missing.push('graph.state=ready');
  return missing.length === 0
    ? pass('Orca runtime and graph are ready.')
    : fail(`Orca runtime readiness failed; required ${missing.join(', ')}.`);
}

function unavailable(
  command: string,
  kind: Exclude<CommandResult, { kind: 'success' }>['kind'],
  detail?: string,
  repositoryTarget?: string,
): OrcaDiscovery {
  const message = detail !== undefined
    ? `Orca ${command} ${detail}.`
    : kind === 'missing'
      ? 'Orca CLI was not found on PATH.'
      : kind === 'timeout'
        ? `Orca ${command} command timed out.`
        : kind === 'malformed'
          ? `Orca ${command} returned malformed JSON.`
          : `Orca ${command} command failed.`;
  return {
    cli: fail(message),
    compatibility: skip(`Orca compatibility was not checked because ${command} discovery failed.`),
    readiness: skip(`Orca readiness was not checked because ${command} discovery failed.`),
    globalSkill: skip(`Global orchestration skill was not checked because ${command} discovery failed.`),
    repository: skip(`Repository registration was not checked because ${command} discovery failed.`),
    ...(repositoryTarget === undefined ? {} : { repositoryTarget }),
    canInstallSkill: false,
    canRegisterRepository: false,
  };
}

function commandCompatibilityFailure(detail: string, repositoryTarget?: string): OrcaDiscovery {
  return {
    cli: pass('Orca CLI is present and exposes a valid agent-context command registry.'),
    compatibility: fail(`${detail}.`),
    readiness: skip('Orca readiness was not checked because command compatibility failed.'),
    globalSkill: skip('Global orchestration skill was not checked because command compatibility failed.'),
    repository: skip('Repository registration was not checked because command compatibility failed.'),
    ...(repositoryTarget === undefined ? {} : { repositoryTarget }),
    canInstallSkill: false,
    canRegisterRepository: false,
  };
}

function statusFailure(
  kind: Exclude<CommandResult, { kind: 'success' }>['kind'],
  detail?: string,
  repositoryTarget?: string,
): OrcaDiscovery {
  const message = detail !== undefined
    ? `Orca status ${detail}.`
    : kind === 'timeout'
      ? 'Orca status command timed out.'
      : kind === 'malformed'
        ? 'Orca status returned malformed JSON or envelope.'
        : kind === 'missing'
          ? 'Orca status command was not found.'
          : 'Orca status command failed.';
  return {
    cli: pass('Orca CLI is present and exposes the required command registry.'),
    compatibility: fail(message),
    readiness: skip('Orca readiness was not checked because status discovery failed.'),
    globalSkill: skip('Global orchestration skill was not checked because status discovery failed.'),
    repository: skip('Repository registration was not checked because status discovery failed.'),
    ...(repositoryTarget === undefined ? {} : { repositoryTarget }),
    canInstallSkill: false,
    canRegisterRepository: false,
  };
}

function readFailure(
  command: string,
  kind: Exclude<CommandResult, { kind: 'success' }>['kind'],
): OrcaCheck {
  if (kind === 'missing') return fail(`Orca ${command} command was not found.`);
  if (kind === 'timeout') return fail(`Orca ${command} command timed out.`);
  if (kind === 'malformed') return malformedRead(command);
  return fail(`Orca ${command} command failed.`);
}

function malformedRead(command: string): OrcaCheck {
  return fail(`Orca ${command} returned malformed JSON or envelope.`);
}

function isRecordWithCode(value: unknown): value is { readonly code?: unknown; readonly timedOut?: unknown } {
  return isRecord(value);
}

function isMissingProcess(value: unknown): boolean {
  return isRecordWithCode(value) && value['code'] === 'ENOENT';
}

function isMissingError(value: unknown): boolean {
  return isMissingProcess(value);
}

function isTimeoutError(value: unknown): boolean {
  return isRecordWithCode(value) && (value['code'] === 'ETIMEDOUT' || value['timedOut'] === true);
}

function isTimedOut(value: unknown): boolean {
  return isTimeoutError(value);
}

function actionLabel(id: OrcaAction['id']): string {
  return id === 'install-orchestration-skill' ? 'global skill installation' : 'repository registration';
}
