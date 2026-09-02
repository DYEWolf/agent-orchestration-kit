import type { GitHubRepositoryIdentity } from '../../repository/inspection.js';
import {
  requiredGitHubActions,
  type GitHubActionReceipt,
  type GitHubAdapter,
  type GitHubDiscovery,
  type GitHubLabelAction,
} from './github.js';

export interface FakeGitHubAdapterOptions {
  readonly discovery?: GitHubDiscovery;
  readonly failures?: readonly GitHubLabelAction['id'][];
  readonly throwOnExecute?: boolean;
}

/** Deterministic WorkflowProject seam; it never spawns gh or changes a remote. */
export class FakeGitHubAdapter implements GitHubAdapter {
  readonly actions: GitHubLabelAction[] = [];
  public discovery: GitHubDiscovery;
  readonly #failures: readonly GitHubLabelAction['id'][];
  readonly #throwOnExecute: boolean;

  public constructor(options?: FakeGitHubAdapterOptions | GitHubDiscovery, failures: readonly GitHubLabelAction['id'][] = []) {
    this.discovery = options !== undefined && 'cli' in options
      ? options
      : options?.discovery ?? defaultDiscovery();
    this.#failures = options !== undefined && 'cli' in options ? failures : options?.failures ?? [];
    this.#throwOnExecute = options !== undefined && 'cli' in options ? false : options?.throwOnExecute ?? false;
  }

  public async discover(_repository: GitHubRepositoryIdentity): Promise<GitHubDiscovery> { return this.discovery; }

  public async execute(action: GitHubLabelAction): Promise<GitHubActionReceipt> {
    this.actions.push(action);
    if (this.#throwOnExecute) throw new Error('fake GitHub secret-sentinel');
    return this.#failures.includes(action.id)
      ? { id: action.id, status: 'failed', message: 'Fake GitHub label creation failed.' }
      : { id: action.id, status: 'executed', message: 'Fake GitHub label creation completed.' };
  }
}

export function defaultDiscovery(): GitHubDiscovery {
  const pass = { status: 'pass' as const, message: 'Fake GitHub check passed.' };
  return {
    cli: pass,
    auth: pass,
    repository: pass,
    repositoryNodeId: 'R_fake_repository',
    repositoryNameWithOwner: 'DYEWolf/example',
    label: { status: 'pass', message: 'Fake ready-for-agent label is present.' },
    labelState: 'exact',
    canCreateLabel: false,
  };
}

export { requiredGitHubActions } from './github.js';
