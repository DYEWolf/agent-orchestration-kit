import { Command, CommanderError } from 'commander';
import { registerInitCommand } from './cli/commands/init.js';
import { registerDoctorCommand } from './cli/commands/doctor.js';
import { registerDiffCommand } from './cli/commands/diff.js';
import { CLI_VERSION } from './version.js';

export function createProgram(): Command {
  const program = new Command();
  program
    .name('orca-kit')
    .description('Configure a repository for an Orca coordinator/worker workflow')
    .version(CLI_VERSION)
    .showHelpAfterError();
  registerInitCommand(program);
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
      : `orca-kit: ${message}\n`,
  );
  process.exitCode = 1;
});
