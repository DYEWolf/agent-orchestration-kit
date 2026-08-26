import type {
  ClaudeHarnessReport,
  HarnessAdapter,
  HarnessCheck,
} from './harness.js';

export interface FakeHarnessAdapterOptions {
  readonly report?: ClaudeHarnessReport;
}
const passingCheck: HarnessCheck = {
  status: 'pass',
  message: 'Fake Claude check passed.',
};

const defaultReport: ClaudeHarnessReport = {
  harness: 'claude',
  cli: passingCheck,
  version: { ...passingCheck, version: '2.1.236' },
  authentication: passingCheck,
};

/** A deterministic adapter for WorkflowProject seam tests; it never spawns a process. */
export class FakeHarnessAdapter implements HarnessAdapter {
  readonly calls: string[] = [];
  readonly #report: ClaudeHarnessReport;

  public constructor(options: FakeHarnessAdapterOptions = {}) {
    this.#report = options.report ?? defaultReport;
  }

  public async checkClaude(): Promise<ClaudeHarnessReport> {
    this.calls.push('claude');
    return this.#report;
  }
}
