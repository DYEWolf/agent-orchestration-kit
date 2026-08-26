import type { Command } from 'commander';
import { formatPlan } from '../format-plan.js';
import { profileNameSchema, type ProfileName } from '../../config/schema.js';
import { WorkflowProject } from '../../workflow-project/workflow-project.js';
import { confirm, isCancel } from '@clack/prompts';

interface InitOptions {
  readonly profile: string;
  readonly dryRun?: boolean;
  readonly yes?: boolean;
  readonly global?: boolean;
  readonly orcaRegistration?: boolean;
  readonly githubMutations?: boolean;
  readonly json?: boolean;
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Configure an existing GitHub repository with the local Orca workflow')
    .argument('[path]', 'repository path', '.')
    .option('--profile <profile>', 'routing profile', 'codex-only')
    .option('--dry-run', 'show the ChangePlan without writing')
    .option('--yes', 'accept the enumerated local mutations')
    .option('--no-global', 'disable global mutations')
    .option('--no-orca-registration', 'disable Orca repository registration')
    .option('--no-github-mutations', 'disable GitHub mutations')
    .option('--json', 'emit stable machine-readable JSON')
    .action(async (path: string, options: InitOptions) => {
      const profile = profileNameSchema.parse(options.profile) as ProfileName;
      if (profile !== 'codex-only') {
        throw new Error('Phase 2 local application currently supports only the codex-only profile.');
      }
      const workflow = new WorkflowProject();
      const plan = await workflow.plan({ type: 'init', path, profile });
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
        const accepted = await confirm({ message: 'Apply exactly this local ChangePlan?' });
        if (isCancel(accepted) || accepted !== true) {
          process.stdout.write('Cancelled; no files were changed.\n');
          return;
        }
      }
      const receipt = await workflow.apply(plan);
      process.stdout.write(
        options.json === true
          ? `${JSON.stringify({ plan, receipt }, null, 2)}\n`
          : `${receipt.reason}\nVerification: ${receipt.verified ? 'PASS' : 'FAIL'}\n`,
      );
    });
}
