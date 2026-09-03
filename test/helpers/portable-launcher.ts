import { chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Writes a disposable tool that cmd.exe and a POSIX shell can both launch. */
export async function writePortableTool(directory: string, name: string, source: string): Promise<string> {
  const extension = /^import\s/mu.test(source) ? '.mjs' : '.cjs';
  const target = path.join(directory, `${name}${extension}`);
  const posixLauncher = path.join(directory, name);
  const windowsLauncher = path.join(directory, `${name}.cmd`);
  await writeFile(target, source, 'utf8');
  await writeFile(posixLauncher, `#!/bin/sh\nexec node "$(dirname "$0")/${name}${extension}" "$@"\n`, { encoding: 'utf8', mode: 0o755 });
  await chmod(posixLauncher, 0o755);
  await writeFile(windowsLauncher, `@echo off\r\nnode "%~dp0${name}${extension}" %*\r\n`, 'utf8');
  return process.platform === 'win32' ? windowsLauncher : posixLauncher;
}

export async function writePortableFixtureTool(directory: string, name: 'gh' | 'orca'): Promise<string> {
  const source = await readFile(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), 'utf8');
  return writePortableTool(directory, name, source);
}
