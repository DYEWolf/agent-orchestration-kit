import type { ChangePlan } from '../workflow-project/change-plan.js';

export function formatPlan(plan: ChangePlan): string {
  const lines = [
    `agent-orchestration-kit init plan (${plan.phase})`,
    `Repository: ${plan.repository.github.display}`,
    `Path: ${plan.repository.root}`,
    `Profile: ${plan.profile.name} [${plan.profile.stability}]`,
    '',
    'Files:',
  ];

  for (const file of plan.files) {
    lines.push(`  ${file.action.toUpperCase().padEnd(9)} ${file.path} — ${file.reason}`);
  }

  lines.push('', 'Orca actions:');
  for (const action of plan.globalCommands) {
    lines.push(
      `  ${action.state.toUpperCase().padEnd(17)} ${action.id} target=${JSON.stringify(action.target)} argv=${JSON.stringify(action.argv)} — ${action.reason}`,
    );
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
    plan.canApply
      ? 'This plan is eligible for local application and its explicitly enumerated Orca actions.'
      : 'This plan cannot be applied until every blocker is resolved.',
  );
  return `${lines.join('\n')}\n`;
}
