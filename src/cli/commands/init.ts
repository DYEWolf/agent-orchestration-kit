import type { Command } from 'commander';
import { formatPlan } from '../format-plan.js';
import { profileNameSchema, type ProfileName } from '../../config/schema.js';
import { WorkflowProject } from '../../workflow-project/workflow-project.js';

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
    .description('Plan configuration of an existing GitHub repository')
    .argument('[path]', 'repository path', '.')
    .option('--profile <profile>', 'routing profile', 'codex-only')
    .option('--dry-run', 'show the ChangePlan without writing')
    .option('--yes', 'accept enumerated mutations (reserved for Phase 2)')
    .option('--no-global', 'disable global mutations')
    .option('--no-orca-registration', 'disable Orca repository registration')
    .option('--no-github-mutations', 'disable GitHub mutations')
    .option('--json', 'emit stable machine-readable JSON')
    .action(async (path: string, options: InitOptions) => {
      if (options.dryRun !== true) {
        throw new Error('Phase 1 is read-only. Re-run with --dry-run; local application arrives in Phase 2.');
      }
      const profile = profileNameSchema.parse(options.profile) as ProfileName;
      if (profile !== 'codex-only') {
        throw new Error('Phase 1 dry-run currently supports only the codex-only profile.');
      }
      const workflow = new WorkflowProject();
      const plan = await workflow.plan({ type: 'init', path, profile });
      process.stdout.write(options.json === true ? `${JSON.stringify(plan, null, 2)}\n` : formatPlan(plan));
      if (plan.blockers.length > 0) process.exitCode = 2;
    });
}
