import type { GitHubRepositoryIdentity } from '../../repository/inspection.js';

export const READY_FOR_AGENT_LABEL = {
  name: 'ready-for-agent',
  color: '0E8A16',
  description: 'Approved, executable, unblocked implementation issue ready to be claimed.',
} as const;

export type GitHubCheckStatus = 'pass' | 'warn' | 'fail' | 'skip';
export type GitHubFailureReason =
  | 'missing'
  | 'command-failure'
  | 'timeout'
  | 'malformed'
  | 'api-failure'
  | 'unauthenticated'
  | 'repository-unreadable'
  | 'repository-identity-mismatch'
  | 'label-read-failure';

export interface GitHubCheck {
  readonly status: GitHubCheckStatus;
  readonly message: string;
  readonly reason?: GitHubFailureReason;
}

export type GitHubLabelState = 'exact' | 'missing' | 'drift' | 'unavailable';

export interface GitHubDiscovery {
  readonly cli: GitHubCheck;
  readonly auth: GitHubCheck;
  readonly repository: GitHubCheck;
  /** Immutable GitHub GraphQL node ID, present only after verified discovery. */
  readonly repositoryNodeId?: string;
  /** Canonical owner/name returned by GitHub, present only after verified discovery. */
  readonly repositoryNameWithOwner?: string;
  readonly label: GitHubCheck;
  readonly labelState: GitHubLabelState;
  /** True only when the exact label lookup authoritatively found no label. */
  readonly canCreateLabel: boolean;
}

export interface GitHubLabelAction {
  readonly id: 'create-ready-for-agent-label';
  /** Immutable GitHub repository node ID used by the create mutation. */
  readonly repositoryNodeId: string;
  readonly target: string;
  readonly name: typeof READY_FOR_AGENT_LABEL.name;
  readonly color: typeof READY_FOR_AGENT_LABEL.color;
  readonly description: typeof READY_FOR_AGENT_LABEL.description;
  readonly argv: readonly string[];
}

export type GitHubAction = GitHubLabelAction;

export interface GitHubActionReceipt {
  readonly id: GitHubLabelAction['id'];
  readonly status: 'executed' | 'failed';
  readonly message: string;
}

export interface GitHubAdapter {
  discover(repository: GitHubRepositoryIdentity): Promise<GitHubDiscovery>;
  execute(action: GitHubLabelAction): Promise<GitHubActionReceipt>;
}

export function requiredGitHubActions(repository: GitHubRepositoryIdentity, repositoryNodeId: string): readonly GitHubLabelAction[] {
  return [{
    id: 'create-ready-for-agent-label',
    repositoryNodeId,
    target: repository.display,
    ...READY_FOR_AGENT_LABEL,
    argv: [
      'api', 'graphql', '--hostname', repository.host,
      '-f', 'query=mutation($repositoryId: ID!, $name: String!, $color: String!, $description: String!) { createLabel(input: { repositoryId: $repositoryId, name: $name, color: $color, description: $description }) { label { name color description repository { id } } } }',
      '-f', `repositoryId=${repositoryNodeId}`,
      '-f', `name=${READY_FOR_AGENT_LABEL.name}`,
      '-f', `color=${READY_FOR_AGENT_LABEL.color}`,
      '-f', `description=${READY_FOR_AGENT_LABEL.description}`,
    ],
  }];
}
