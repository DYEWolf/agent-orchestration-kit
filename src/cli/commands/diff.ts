import type { Command } from 'commander';
import { WorkflowProject } from '../../workflow-project/workflow-project.js';

interface DiffOptions { readonly json?: boolean }

export function registerDiffCommand(program: Command): void {
  program
    .command('diff')
    .description('Report local drift against the installed manifest')
    .argument('[path]', 'repository path', '.')
    .option('--json', 'emit stable machine-readable JSON')
    .action(async (path: string, options: DiffOptions) => {
      const report = await new WorkflowProject().diff(path);
      if (options.json === true) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      } else if (report.clean) {
        process.stdout.write('PASS No local drift detected.\n');
      } else {
        process.stdout.write(`Installation: ${report.installation}\n`);
        for (const item of report.items) process.stdout.write(`${item.status.toUpperCase()} ${item.path}\n`);
      }
      if (!report.clean) process.exitCode = 2;
    });
}
