import type { Command } from 'commander';
import { formatPlan } from '../format-plan.js';
import { profileNameSchema, type ProfileName } from '../../config/schema.js';
import { WorkflowProject, type WorkflowProjectContract } from '../../workflow-project/workflow-project.js';
import { confirm, isCancel } from '@clack/prompts';

export interface InitCommandDependencies {
  /** Injectable workflow seam used by deterministic command tests. */
  readonly createWorkflow?: () => WorkflowProjectContract;
  /** Injectable confirmation seam used to exercise the real cancellation branch. */
  readonly confirm?: typeof confirm;
}

interface InitOptions {
  readonly profile: string;
  readonly dryRun?: boolean;
  readonly yes?: boolean;
  readonly global?: boolean;
  readonly orcaRegistration?: boolean;
  readonly githubMutations?: boolean;
  readonly json?: boolean;
}

export function registerInitCommand(program: Command, dependencies: InitCommandDependencies = {}): void {
  program
    .command('init')
    .description('Configure an existing GitHub repository with the local agent-orchestration workflow')
    .argument('[path]', 'repository path', '.')
    .option('--profile <profile>', 'routing profile', 'codex-only')
    .option('--dry-run', 'show the ChangePlan without writing')
    .option('--yes', 'accept only the complete enumerated ChangePlan, including its enumerated Orca actions and GitHub actions')
    .option('--no-global', 'disable global mutations')
    .option('--no-orca-registration', 'disable Orca repository registration')
    .option('--no-github-mutations', 'disable GitHub mutations')
    .option('--json', 'emit stable machine-readable JSON')
    .action(async (path: string, options: InitOptions) => {
      const profile = profileNameSchema.parse(options.profile) as ProfileName;
      const workflow = dependencies.createWorkflow?.() ?? new WorkflowProject();
      const plan = await workflow.plan({
        type: 'init', path, profile,
        global: options.global !== false,
        orcaRegistration: options.orcaRegistration !== false,
        githubMutations: options.githubMutations !== false,
      });
      if (options.dryRun === true) {
        process.stdout.write(options.json === true ? `${JSON.stringify(plan, null, 2)}\n` : formatPlan(plan));
        if (plan.blockers.length > 0) process.exitCode = 2;
        return;
      }
      if (plan.blockers.length > 0) {
        process.stdout.write(options.json === true ? `${JSON.stringify(plan, null, 2)}\n` : formatPlan(plan));
        process.exitCode = 2;
        return;
      }
      if (options.json === true && options.yes !== true) {
        throw new Error('--json requires --yes or --dry-run because interactive prompts would corrupt JSON output.');
      }
      if (options.json !== true) process.stdout.write(formatPlan(plan));
      if (options.yes !== true) {
        const accepted = await (dependencies.confirm ?? confirm)({ message: 'Apply exactly this ChangePlan, including its enumerated Orca actions and GitHub actions?' });
        if (isCancel(accepted) || accepted !== true) {
          process.stdout.write('Cancelled; no files were changed.\n');
          return;
        }
      }
      const receipt = await workflow.apply(plan);
      if (receipt.externalActions.some((action) => action.status === 'failed') || receipt.githubActions.some((action) => action.status === 'failed')) process.exitCode = 2;
      process.stdout.write(
        options.json === true
          ? `${JSON.stringify({ plan, receipt }, null, 2)}\n`
          : [
              receipt.reason,
              `Verification: ${receipt.verified ? 'PASS' : 'FAIL'}`,
              ...receipt.externalActions.map((action) =>
                `Orca action ${action.id}: ${action.status.toUpperCase()} — ${action.message}`,
              ),
              ...receipt.githubActions.map((action) =>
                `GitHub action ${action.id}: ${action.status.toUpperCase()} — ${action.message}`,
              ),
              '',
            ].join('\n'),
      );
    });
}
