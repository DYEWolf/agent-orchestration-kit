import type { ChangePlan } from '../workflow-project/change-plan.js';

export function formatPlan(plan: ChangePlan): string {
  const lines = [
    `orca-kit init plan (${plan.phase})`,
    `Repository: ${plan.repository.github.display}`,
    `Path: ${plan.repository.root}`,
    `Profile: ${plan.profile.name} [${plan.profile.stability}]`,
    '',
    'Files:',
  ];

  for (const file of plan.files) {
    lines.push(`  ${file.action.toUpperCase().padEnd(9)} ${file.path} — ${file.reason}`);
  }

  if (plan.blockers.length > 0) {
    lines.push('', 'Blockers:');
    for (const blocker of plan.blockers) {
      lines.push(`  ${blocker.code.toUpperCase()} ${blocker.path} — ${blocker.message}`);
    }
  }

  lines.push(
    '',
    `Summary: ${plan.summary.create} create, ${plan.summary.update} update, ${plan.summary.unchanged} unchanged, ${plan.summary.blocked} blocked`,
    'Dry-run only: no files, global configuration, or GitHub resources were changed.',
  );
  return `${lines.join('\n')}\n`;
}
