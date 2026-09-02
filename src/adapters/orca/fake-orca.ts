import type { OrcaAction, OrcaActionReceipt, OrcaAdapter, OrcaDiscovery } from './orca.js';

export class FakeOrcaAdapter implements OrcaAdapter {
  readonly actions: OrcaAction[] = [];
  public constructor(private readonly discovery: OrcaDiscovery, private readonly failures: readonly OrcaAction['id'][] = []) {}
  public async discover(repositoryRoot: string): Promise<OrcaDiscovery> {
    return this.discovery.repositoryTarget === undefined
      ? { ...this.discovery, repositoryTarget: repositoryRoot }
      : this.discovery;
  }
  public async execute(action: OrcaAction): Promise<OrcaActionReceipt> { this.actions.push(action); return this.failures.includes(action.id) ? { id: action.id, status: 'failed', message: `Fake Orca action ${action.id} failed.` } : { id: action.id, status: 'executed', message: `Fake Orca action ${action.id} completed.` }; }
}
