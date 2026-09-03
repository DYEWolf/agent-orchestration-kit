import { execa } from 'execa';
import {
  CLAUDE_MINIMUM_VERSION,
  compareVersions,
  minimumClaudeVersion,
  parseVersion,
  type ClaudeHarnessReport,
  type HarnessAdapter,
  type HarnessCheck,
} from './harness.js';

export interface NodeHarnessAdapterOptions {
  /** The executable is injectable so tests can use a deterministic fake process. */
  readonly executable?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
}

interface CommandOutput {
  readonly kind: 'success' | 'missing' | 'command-failure';
  readonly stdout: string;
}

export class NodeHarnessAdapter implements HarnessAdapter {
  readonly #executable: string;
  readonly #env: NodeJS.ProcessEnv | undefined;
  readonly #timeoutMs: number;

  public constructor(options: NodeHarnessAdapterOptions = {}) {
    this.#executable = options.executable ?? 'claude';
    this.#env = options.env;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
  }

  public async checkClaude(): Promise<ClaudeHarnessReport> {
    const versionCommand = await this.run(['--version']);
    const version = this.classifyVersion(versionCommand);
    const cli = this.classifyCli(versionCommand);

    if (versionCommand.kind !== 'success') {
      return {
        harness: 'claude',
        cli,
        version,
        authentication: {
          status: 'skip',
          reason: 'not-checked',
          message: 'Claude authentication was not checked because the CLI could not be executed.',
        },
      };
    }

    const authenticationCommand = await this.run(['auth', 'status', '--json']);
    return {
      harness: 'claude',
      cli,
      version,
      authentication: this.classifyAuthentication(authenticationCommand),
    };
  }

  private async run(arguments_: readonly string[]): Promise<CommandOutput> {
    try {
      const result = await execa(this.#executable, arguments_, {
        ...(this.#env === undefined ? {} : { env: this.#env }),
        reject: false,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'ignore',
        timeout: this.#timeoutMs,
      });
      if (isMissingExecutable(result)) return { kind: 'missing', stdout: '' };
      if (result.failed || result.exitCode !== 0) return { kind: 'command-failure', stdout: '' };
      return { kind: 'success', stdout: typeof result.stdout === 'string' ? result.stdout : '' };
    } catch (error) {
      return isMissingExecutable(error)
        ? { kind: 'missing', stdout: '' }
        : { kind: 'command-failure', stdout: '' };
    }
  }

  private classifyCli(command: CommandOutput): HarnessCheck {
    if (command.kind === 'missing') return {
      status: 'fail',
      reason: 'missing',
      message: 'Claude Code CLI was not found; install it before using a Claude profile.',
    };
    if (command.kind === 'command-failure') return {
      status: 'fail',
      reason: 'command-failure',
      message: 'Claude Code CLI could not be executed for its version check.',
    };
    return { status: 'pass', message: 'Claude Code CLI is present and executable.' };
  }

  private classifyVersion(command: CommandOutput): HarnessCheck {
    if (command.kind === 'missing') return {
      status: 'fail',
      reason: 'missing',
      message: 'Claude Code version is unavailable because the CLI is missing.',
    };
    if (command.kind === 'command-failure') return {
      status: 'fail',
      reason: 'command-failure',
      message: 'Claude Code version could not be read because the CLI command failed.',
    };
    const parsed = parseVersion(command.stdout);
    if (parsed === undefined) return {
      status: 'fail',
      reason: 'malformed',
      message: 'Claude Code returned malformed version output; expected a semantic version such as 2.1.236.',
    };
    const version = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
    if (compareVersions(parsed, minimumClaudeVersion) < 0) return {
      status: 'fail',
      reason: 'outdated',
      version,
      message: `Claude Code ${version} is below the minimum supported version ${CLAUDE_MINIMUM_VERSION}.`,
    };
    return {
      status: 'pass',
      version,
      message: `Claude Code ${version} meets the minimum supported version ${CLAUDE_MINIMUM_VERSION}.`,
    };
  }

  private classifyAuthentication(command: CommandOutput): HarnessCheck {
    if (command.kind === 'missing') return {
      status: 'fail',
      reason: 'missing',
      message: 'Claude authentication could not be checked because the CLI is missing.',
    };
    if (command.kind === 'command-failure') return {
      status: 'fail',
      reason: 'command-failure',
      message: 'Claude authentication status command failed; Doctor did not start login.',
    };
    try {
      const parsed: unknown = JSON.parse(command.stdout);
      if (!isRecord(parsed) || typeof parsed['loggedIn'] !== 'boolean') throw new Error('malformed');
      if (!parsed['loggedIn']) return {
        status: 'fail',
        reason: 'unauthenticated',
        message: 'Claude Code reports that the user is not logged in; authenticate separately before using a Claude profile.',
      };
      return { status: 'pass', message: 'Claude Code authentication status reports loggedIn=true.' };
    } catch {
      return {
        status: 'fail',
        reason: 'malformed',
        message: 'Claude authentication status returned malformed JSON; expected a boolean loggedIn field.',
      };
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissingExecutable(result: unknown): boolean {
  return isRecord(result) && result['code'] === 'ENOENT';
}

export { CLAUDE_MINIMUM_VERSION } from './harness.js';
