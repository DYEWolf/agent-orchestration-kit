import type { Command } from 'commander';
import { WorkflowProject } from '../../workflow-project/workflow-project.js';

interface DoctorOptions { readonly json?: boolean }

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Diagnose the local agent-orchestration-kit installation')
    .argument('[path]', 'repository path', '.')
    .option('--json', 'emit stable machine-readable JSON')
    .action(async (path: string, options: DoctorOptions) => {
      const report = await new WorkflowProject().doctor(path);
      if (options.json === true) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      } else {
        for (const check of report.checks) {
          process.stdout.write(`${check.status.padEnd(4)} ${check.id} — ${check.message}\n`);
        }
        process.stdout.write(`Summary: ${report.summary.PASS} PASS, ${report.summary.WARN} WARN, ${report.summary.FAIL} FAIL, ${report.summary.SKIP} SKIP\n`);
      }
      if (!report.healthy) process.exitCode = 2;
    });
}
