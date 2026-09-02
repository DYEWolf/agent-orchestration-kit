import { execa } from 'execa';
import {
  READY_FOR_AGENT_LABEL,
  requiredGitHubActions,
  type GitHubActionReceipt,
  type GitHubAdapter,
  type GitHubCheck,
  type GitHubDiscovery,
  type GitHubLabelAction,
} from './github.js';
import type { GitHubRepositoryIdentity } from '../../repository/inspection.js';

export interface NodeGitHubAdapterOptions {
  /** The executable is injectable so tests can use a deterministic fake process. */
  readonly executable?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
}

const REPOSITORY_QUERY = 'query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { id nameWithOwner } }';
const LABEL_QUERY = 'query($repositoryId: ID!, $name: String!) { node(id: $repositoryId) { ... on Repository { label(name: $name) { name color description } } } }';

type CommandResult =
  | { readonly kind: 'success'; readonly stdout?: string; readonly value?: unknown }
  | { readonly kind: 'missing' | 'failed' | 'timeout' | 'malformed' | 'api-failure'; readonly stdout?: string };

interface RepositoryMetadata {
  readonly repositoryNodeId: string;
  readonly nameWithOwner: string;
}

type LabelMetadata = {
  readonly name: string;
  readonly color: string;
  readonly description: string | null;
} | null;

export class NodeGitHubAdapter implements GitHubAdapter {
  readonly #executable: string;
  readonly #env: NodeJS.ProcessEnv | undefined;
  readonly #timeoutMs: number;
  #discoveryGeneration = 0;
  #authorizedAction: GitHubLabelAction | undefined;

  public constructor(options: NodeGitHubAdapterOptions = {}) {
    this.#executable = options.executable ?? 'gh';
    this.#env = options.env;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
  }

  public async discover(repository: GitHubRepositoryIdentity): Promise<GitHubDiscovery> {
    // A discovery is the sole authority for a subsequent GitHub mutation. Any
    // prior authority must be cleared before even the first probe so a failed,
    // partial, or different-repository discovery can never inherit it.
    const generation = ++this.#discoveryGeneration;
    this.#authorizedAction = undefined;
    const cli = await this.runCommand(['--version']);
    if (cli.kind !== 'success') return unavailableDiscovery('version', cli.kind);

    const cliCheck = pass('GitHub CLI is present and executable.');
    const auth = await this.discoverAuth(repository);
    if (auth.status !== 'pass') {
      return {
        cli: cliCheck,
        auth,
        repository: skip('GitHub repository was not checked because GitHub authentication failed.'),
        label: skip('The ready-for-agent label was not checked because GitHub authentication failed.'),
        labelState: 'unavailable',
        canCreateLabel: false,
      };
    }

    const repositoryDiscovery = await this.discoverRepository(repository);
    if (repositoryDiscovery.check.status !== 'pass'
      || repositoryDiscovery.repositoryNodeId === undefined
      || repositoryDiscovery.nameWithOwner === undefined) {
      return {
        cli: cliCheck,
        auth,
        repository: repositoryDiscovery.check,
        label: skip('The ready-for-agent label was not checked because the GitHub repository could not be verified.'),
        labelState: 'unavailable',
        canCreateLabel: false,
      };
    }

    const labelDiscovery = await this.discoverLabel(repository, repositoryDiscovery.repositoryNodeId);
    const discovery: GitHubDiscovery = {
      cli: cliCheck,
      auth,
      repository: repositoryDiscovery.check,
      repositoryNodeId: repositoryDiscovery.repositoryNodeId,
      repositoryNameWithOwner: repositoryDiscovery.nameWithOwner,
      ...labelDiscovery,
    };
    if (generation === this.#discoveryGeneration
      && isAuthoritativeMissingLabel(discovery)) {
      this.#authorizedAction = requiredGitHubActions(repository, repositoryDiscovery.repositoryNodeId)[0];
    }
    return discovery;
  }

  public async execute(action: GitHubLabelAction): Promise<GitHubActionReceipt> {
    const authorizedAction = this.#authorizedAction;
    if (authorizedAction === undefined || !sameAction(action, authorizedAction)) {
      return {
        id: 'create-ready-for-agent-label',
        status: 'failed',
        message: 'GitHub action is unsupported or is not authorized by the latest verified discovery.',
      };
    }
    // Consume the one-shot authority before crossing the process boundary.
    // This prevents repeated execute calls from creating the same label twice.
    this.#authorizedAction = undefined;
    const result = await this.runCommand(action.argv);
    if (result.kind === 'timeout') return failedReceipt('timed out');
    if (result.kind === 'missing') return failedReceipt('could not be found on PATH');
    if (result.kind !== 'success') return failedReceipt('failed');
    const response = parseGraphQLResponse(result.stdout ?? '');
    if (response.kind !== 'success') {
      return failedReceipt(response.kind === 'malformed'
        ? 'returned malformed JSON or an invalid GraphQL response'
        : 'returned an API error');
    }
    if (!isCreatedLabelForAction(response.data, action)) return failedReceipt('returned an unexpected label response');
    return { id: action.id, status: 'executed', message: 'GitHub ready-for-agent label creation completed.' };
  }

  private async discoverAuth(repository: GitHubRepositoryIdentity): Promise<GitHubCheck> {
    const result = await this.runJson(['auth', 'status', '--hostname', repository.host, '--json', 'hosts']);
    if (result.kind !== 'success') return readFailure(`GitHub authentication for host ${repository.host}`, result.kind);
    try {
      const hosts = authHosts(result.value);
      if (hosts === undefined) return fail(`GitHub authentication status for host ${repository.host} returned malformed JSON.`, 'malformed');
      const configured = hosts[repository.host];
      const records = Array.isArray(configured) ? configured : configured === undefined ? [] : [configured];
      const active = records.some((record) => isRecord(record) && record['active'] === true
        && (record['host'] === undefined || (typeof record['host'] === 'string' && record['host'].toLowerCase() === repository.host.toLowerCase())));
      return active
        ? pass(`GitHub authentication for host ${repository.host} is active.`)
        : fail(`No active GitHub authentication is configured for host ${repository.host}; authenticate separately before init.`, 'unauthenticated');
    } catch {
      return fail(`GitHub authentication status for host ${repository.host} returned malformed JSON.`, 'malformed');
    }
  }

  private async discoverRepository(repository: GitHubRepositoryIdentity): Promise<{
    readonly check: GitHubCheck;
    readonly repositoryNodeId?: string;
    readonly nameWithOwner?: string;
  }> {
    const result = await this.runGraphQLJson([
      'api', 'graphql', '--hostname', repository.host,
      '-f', `query=${REPOSITORY_QUERY}`,
      '-f', `owner=${repository.owner}`,
      '-f', `name=${repository.name}`,
    ]);
    if (result.kind !== 'success') {
      return { check: readFailure(`GitHub repository ${repository.display}`, result.kind) };
    }
    const metadata = readRepositoryMetadata(result.value);
    if (metadata === 'malformed') {
      return { check: fail(`GitHub repository ${repository.display} returned malformed identity metadata.`, 'malformed') };
    }
    if (metadata === null) {
      return { check: fail(`GitHub repository ${repository.display} could not be found or read.`, 'repository-unreadable') };
    }
    if (metadata.nameWithOwner.toLowerCase() !== `${repository.owner}/${repository.name}`.toLowerCase()) {
      return { check: fail(`GitHub repository identity does not match the inspected remote ${repository.display}.`, 'repository-identity-mismatch') };
    }
    return {
      check: pass(`GitHub repository ${repository.display} matches the inspected remote identity and immutable node ID was verified.`),
      repositoryNodeId: metadata.repositoryNodeId,
      nameWithOwner: metadata.nameWithOwner,
    };
  }

  private async discoverLabel(
    repository: GitHubRepositoryIdentity,
    repositoryNodeId: string,
  ): Promise<Pick<GitHubDiscovery, 'label' | 'labelState' | 'canCreateLabel'>> {
    const result = await this.runGraphQLJson([
      'api', 'graphql', '--hostname', repository.host,
      '-f', `query=${LABEL_QUERY}`,
      '-f', `repositoryId=${repositoryNodeId}`,
      '-f', `name=${READY_FOR_AGENT_LABEL.name}`,
    ]);
    if (result.kind !== 'success') {
      return {
        label: labelReadFailure(repository.display, result.kind),
        labelState: 'unavailable',
        canCreateLabel: false,
      };
    }
    const label = readLabelMetadata(result.value);
    if (label === 'malformed' || label === 'unavailable') {
      return {
        label: labelReadFailure(repository.display, label === 'malformed' ? 'malformed' : 'failed'),
        labelState: 'unavailable',
        canCreateLabel: false,
      };
    }
    if (label === null) {
      return {
        label: fail(`GitHub label ${READY_FOR_AGENT_LABEL.name} is missing from ${repository.display}; it will be planned for creation.`, 'missing'),
        labelState: 'missing',
        canCreateLabel: true,
      };
    }
    const exact = label.name === READY_FOR_AGENT_LABEL.name
      && label.color.toLowerCase() === READY_FOR_AGENT_LABEL.color.toLowerCase()
      && label.description === READY_FOR_AGENT_LABEL.description;
    if (exact) {
      return {
        label: pass(`GitHub label ${READY_FOR_AGENT_LABEL.name} has canonical color ${READY_FOR_AGENT_LABEL.color} and description ${JSON.stringify(READY_FOR_AGENT_LABEL.description)}.`),
        labelState: 'exact',
        canCreateLabel: false,
      };
    }
    return {
      label: { status: 'warn', message: `GitHub label ${READY_FOR_AGENT_LABEL.name} has metadata drift or a case collision; it will be preserved and not mutated.` },
      labelState: 'drift',
      canCreateLabel: false,
    };
  }

  private async runJson(argv: readonly string[]): Promise<CommandResult> {
    const result = await this.runCommand(argv);
    let value: unknown;
    try {
      value = JSON.parse(result.stdout ?? '') as unknown;
    } catch {
      return result.kind === 'success' ? { kind: 'malformed' } : result;
    }
    if (result.kind !== 'success') return result;
    return result.stdout === undefined
      ? { kind: 'success', value }
      : { kind: 'success', stdout: result.stdout, value };
  }

  private async runGraphQLJson(argv: readonly string[]): Promise<CommandResult> {
    const result = await this.runCommand(argv);
    if (result.kind !== 'success') return result;
    const response = parseGraphQLResponse(result.stdout ?? '');
    if (response.kind !== 'success') return response;
    return result.stdout === undefined
      ? { kind: 'success', value: response.data }
      : { kind: 'success', stdout: result.stdout, value: response.data };
  }

  private async runCommand(argv: readonly string[]): Promise<CommandResult> {
    try {
      const result = await execa(this.#executable, argv, {
        ...(this.#env === undefined ? {} : { env: this.#env }),
        reject: false,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'ignore',
        timeout: this.#timeoutMs,
      });
      const stdout = typeof result.stdout === 'string' ? result.stdout : '';
      if (isMissingProcess(result)) return { kind: 'missing', stdout };
      if (isTimedOut(result)) return { kind: 'timeout', stdout };
      if (result.failed || result.exitCode !== 0) return { kind: 'failed', stdout };
      return { kind: 'success', stdout };
    } catch (error) {
      if (isMissingError(error)) return { kind: 'missing' };
      if (isTimeoutError(error)) return { kind: 'timeout' };
      return { kind: 'failed' };
    }
  }
}

function unavailableDiscovery(command: string, kind: Exclude<CommandResult, { kind: 'success' }>['kind']): GitHubDiscovery {
  const message = kind === 'missing'
    ? 'GitHub CLI was not found on PATH; install gh before using GitHub integration.'
    : kind === 'timeout'
      ? `GitHub CLI ${command} check timed out.`
      : kind === 'malformed'
        ? `GitHub CLI ${command} check returned malformed JSON.`
        : `GitHub CLI ${command} check failed.`;
  const reason = kind === 'missing' ? 'missing' : kind === 'timeout' ? 'timeout' : kind === 'malformed' ? 'malformed' : kind === 'api-failure' ? 'api-failure' : 'command-failure';
  return {
    cli: fail(message, reason),
    auth: skip('GitHub authentication was not checked because the GitHub CLI is unavailable.'),
    repository: skip('GitHub repository was not checked because the GitHub CLI is unavailable.'),
    label: skip('The ready-for-agent label was not checked because the GitHub CLI is unavailable.'),
    labelState: 'unavailable',
    canCreateLabel: false,
  };
}

function readFailure(subject: string, kind: Exclude<CommandResult, { kind: 'success' }>['kind']): GitHubCheck {
  const reason = kind === 'missing' ? 'missing' : kind === 'timeout' ? 'timeout' : kind === 'malformed' ? 'malformed' : kind === 'api-failure' ? 'api-failure' : 'command-failure';
  return fail(kind === 'missing'
    ? `${subject} could not be checked because the GitHub CLI is missing.`
    : kind === 'timeout'
      ? `${subject} check timed out.`
      : kind === 'malformed'
        ? `${subject} returned malformed JSON.`
        : kind === 'api-failure'
          ? `${subject} API request failed.`
          : `${subject} command failed.`, reason);
}

function labelReadFailure(repositoryDisplay: string, kind: Exclude<CommandResult, { kind: 'success' }>['kind'] | 'failed'): GitHubCheck {
  const reason = kind === 'malformed' ? 'malformed' : kind === 'api-failure' ? 'api-failure' : 'label-read-failure';
  return fail(kind === 'malformed'
    ? `GitHub labels for ${repositoryDisplay} returned malformed metadata and cannot be trusted.`
    : kind === 'api-failure'
      ? `GitHub labels for ${repositoryDisplay} could not be read because the API request failed.`
      : `GitHub labels for ${repositoryDisplay} could not be read authoritatively.`, reason);
}

function authHosts(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) && isRecord(value['hosts']) ? value['hosts'] : undefined;
}

function readRepositoryMetadata(value: unknown): RepositoryMetadata | null | 'malformed' {
  if (!isRecord(value)) return 'malformed';
  const repository = value['repository'];
  if (repository === null) return null;
  if (!isRecord(repository)
    || !Object.prototype.hasOwnProperty.call(repository, 'id')
    || !Object.prototype.hasOwnProperty.call(repository, 'nameWithOwner')
    || typeof repository['id'] !== 'string' || repository['id'].length === 0
    || typeof repository['nameWithOwner'] !== 'string' || repository['nameWithOwner'].length === 0) return 'malformed';
  return { repositoryNodeId: repository['id'], nameWithOwner: repository['nameWithOwner'] };
}

function readLabelMetadata(value: unknown): LabelMetadata | 'malformed' | 'unavailable' {
  if (!isRecord(value)) return 'malformed';
  const node = value['node'];
  if (node === null || !isRecord(node) || !Object.prototype.hasOwnProperty.call(node, 'label')) return 'unavailable';
  const label = node['label'];
  if (label === null) return null;
  if (!isRecord(label)
    || !Object.prototype.hasOwnProperty.call(label, 'name')
    || !Object.prototype.hasOwnProperty.call(label, 'color')
    || !Object.prototype.hasOwnProperty.call(label, 'description')
    || typeof label['name'] !== 'string' || typeof label['color'] !== 'string'
    || !(typeof label['description'] === 'string' || label['description'] === null)) return 'malformed';
  return { name: label['name'], color: label['color'], description: label['description'] };
}

type GraphQLResponse =
  | { readonly kind: 'success'; readonly data: Record<string, unknown> }
  | { readonly kind: 'malformed' | 'api-failure' };

function parseGraphQLResponse(stdout: string): GraphQLResponse {
  let value: unknown;
  try {
    value = JSON.parse(stdout) as unknown;
  } catch {
    return { kind: 'malformed' };
  }
  if (!isRecord(value)) return { kind: 'malformed' };
  if (Object.prototype.hasOwnProperty.call(value, 'errors')) {
    if (!Array.isArray(value['errors'])) return { kind: 'malformed' };
    if (value['errors'].length > 0) return { kind: 'api-failure' };
  }
  if (!isRecord(value['data'])) return { kind: 'malformed' };
  return { kind: 'success', data: value['data'] };
}

function isCreatedLabelForAction(data: Record<string, unknown>, action: GitHubLabelAction): boolean {
  const createLabel = data['createLabel'];
  if (!isRecord(createLabel)) return false;
  const label = createLabel['label'];
  if (!isRecord(label)
    || !Object.prototype.hasOwnProperty.call(label, 'name')
    || !Object.prototype.hasOwnProperty.call(label, 'color')
    || !Object.prototype.hasOwnProperty.call(label, 'description')
    || !Object.prototype.hasOwnProperty.call(label, 'repository')
    || typeof label['name'] !== 'string'
    || typeof label['color'] !== 'string'
    || typeof label['description'] !== 'string') return false;
  const responseRepository = label['repository'];
  if (!isRecord(responseRepository)
    || !Object.prototype.hasOwnProperty.call(responseRepository, 'id')
    || typeof responseRepository['id'] !== 'string') return false;
  return label['name'] === action.name
    && label['color'].toLowerCase() === action.color.toLowerCase()
    && label['description'] === action.description
    && responseRepository['id'] === action.repositoryNodeId;
}

function sameAction(left: GitHubLabelAction, right: GitHubLabelAction): boolean {
  return left.id === right.id && left.repositoryNodeId === right.repositoryNodeId && left.target === right.target
    && left.name === right.name && left.color === right.color && left.description === right.description
    && left.argv.length === right.argv.length && left.argv.every((part, index) => part === right.argv[index]);
}

function isAuthoritativeMissingLabel(discovery: GitHubDiscovery): boolean {
  return discovery.cli.status === 'pass'
    && discovery.auth.status === 'pass'
    && discovery.repository.status === 'pass'
    && typeof discovery.repositoryNodeId === 'string'
    && discovery.repositoryNodeId.length > 0
    && typeof discovery.repositoryNameWithOwner === 'string'
    && discovery.labelState === 'missing'
    && discovery.canCreateLabel;
}

function failedReceipt(reason: string): GitHubActionReceipt {
  return { id: 'create-ready-for-agent-label', status: 'failed', message: `GitHub ready-for-agent label creation ${reason}.` };
}

function pass(message: string): GitHubCheck { return { status: 'pass', message }; }
function fail(message: string, reason?: GitHubCheck['reason']): GitHubCheck {
  return reason === undefined ? { status: 'fail', message } : { status: 'fail', message, reason };
}
function skip(message: string): GitHubCheck { return { status: 'skip', message }; }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissingProcess(value: unknown): boolean {
  return isRecord(value) && value['code'] === 'ENOENT';
}

function isMissingError(value: unknown): boolean { return isMissingProcess(value); }

function isTimeoutError(value: unknown): boolean {
  return isRecord(value) && (value['code'] === 'ETIMEDOUT' || value['timedOut'] === true);
}

function isTimedOut(value: unknown): boolean { return isTimeoutError(value); }

export { READY_FOR_AGENT_LABEL } from './github.js';
