export const CLAUDE_MINIMUM_VERSION = '2.1.236' as const;

export interface HarnessVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export type HarnessCheckStatus = 'pass' | 'fail' | 'skip';
export type HarnessFailureReason =
  | 'missing'
  | 'outdated'
  | 'unauthenticated'
  | 'malformed'
  | 'command-failure'
  | 'not-checked';

export interface HarnessCheck {
  readonly status: HarnessCheckStatus;
  readonly message: string;
  readonly reason?: HarnessFailureReason;
  readonly version?: string;
}

export interface ClaudeHarnessReport {
  readonly harness: 'claude';
  readonly cli: HarnessCheck;
  readonly version: HarnessCheck;
  readonly authentication: HarnessCheck;
}

export interface HarnessAdapter {
  checkClaude(): Promise<ClaudeHarnessReport>;
}

export function compareVersions(left: HarnessVersion, right: HarnessVersion): number {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

export function parseVersion(output: string): HarnessVersion | undefined {
  const match = /(?:^|\D)(\d+)\.(\d+)\.(\d+)(?:$|\D)/u.exec(output);
  if (match === null) return undefined;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every(Number.isSafeInteger)) return undefined;
  return { major, minor, patch };
}

export const minimumClaudeVersion: HarnessVersion = { major: 2, minor: 1, patch: 236 };
