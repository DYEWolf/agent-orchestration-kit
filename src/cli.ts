import { Command, CommanderError } from 'commander';
import { registerInitCommand, type InitCommandDependencies } from './cli/commands/init.js';
import { registerDoctorCommand } from './cli/commands/doctor.js';
import { registerDiffCommand } from './cli/commands/diff.js';
import { CLI_VERSION } from './version.js';

export function createProgram(initDependencies: InitCommandDependencies = {}): Command {
  const program = new Command();
  program
    .name('agent-orchestration-kit')
    .description('Configure a repository for an agent-orchestration workflow compatible with Orca')
    .version(CLI_VERSION)
    .showHelpAfterError();
  registerInitCommand(program, initDependencies);
  registerDoctorCommand(program);
  registerDiffCommand(program);
  return program;
}

export async function main(argv = process.argv): Promise<void> {
  const program = createProgram();
  const commands = collectCommands(program);
  for (const command of commands) command.exitOverride();
  if (argv.includes('--json')) {
    for (const command of commands) command.configureOutput({ writeErr: () => undefined });
  }
  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return;
    throw error;
  }
}

function collectCommands(root: Command): Command[] {
  return [root, ...root.commands.flatMap(collectCommands)];
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const jsonRequested = process.argv.includes('--json');
  process.stderr.write(
    jsonRequested
      ? `${JSON.stringify({ error: { message } })}\n`
      : `agent-orchestration-kit: ${message}\n`,
  );
  process.exitCode = 1;
});
