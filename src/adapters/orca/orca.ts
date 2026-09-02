export const ORCA_MINIMUM_VERSION = '1.4.190' as const;

export type OrcaCheckStatus = 'pass' | 'fail' | 'skip';

export interface OrcaCheck {
  readonly status: OrcaCheckStatus;
  readonly message: string;
}

export interface OrcaDiscovery {
  readonly cli: OrcaCheck;
  readonly compatibility: OrcaCheck;
  readonly readiness: OrcaCheck;
  readonly globalSkill: OrcaCheck;
  readonly repository: OrcaCheck;
  /** Canonical path used for both repository matching and registration. */
  readonly repositoryTarget?: string;
  /** Whether the successful skill observation can safely support installation. */
  readonly canInstallSkill: boolean;
  /** Whether the successful repository observation can safely support registration. */
  readonly canRegisterRepository: boolean;
}

export interface OrcaAction {
  readonly id: 'install-orchestration-skill' | 'register-repository';
  readonly argv: readonly string[];
}

export interface OrcaActionReceipt {
  readonly id: OrcaAction['id'];
  readonly status: 'executed' | 'failed';
  readonly message: string;
}

export interface OrcaAdapter {
  discover(repositoryRoot: string): Promise<OrcaDiscovery>;
  execute(action: OrcaAction): Promise<OrcaActionReceipt>;
}

export function compareOrcaVersions(left: string, right: string): number | undefined {
  const parse = (value: string): readonly [number, number, number] | undefined => {
    const match = /^([0]|[1-9]\d*)\.([0]|[1-9]\d*)\.([0]|[1-9]\d*)$/u.exec(value);
    if (match === null) return undefined;
    const parts = match.slice(1).map(Number);
    if (!parts.every(Number.isSafeInteger)) return undefined;
    return parts as [number, number, number];
  };
  const a = parse(left); const b = parse(right);
  if (a === undefined || b === undefined) return undefined;
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

export function requiredOrcaActions(repositoryRoot: string): readonly OrcaAction[] {
  return [
    { id: 'install-orchestration-skill', argv: ['skills', 'install', '--skill', 'orchestration'] },
    { id: 'register-repository', argv: ['repo', 'add', '--path', repositoryRoot] },
  ];
}
