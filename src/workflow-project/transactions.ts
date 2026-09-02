import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FileSystemAdapter } from '../adapters/filesystem/filesystem.js';

export interface TransactionWrite {
  readonly path: string;
  readonly content: string;
}

export interface TransactionReceipt {
  readonly written: readonly string[];
  readonly createdDirectories: readonly string[];
  readonly cleanupWarnings: readonly string[];
}

interface LedgerEntry {
  readonly target: string;
  readonly temporary: string;
  readonly backup: string;
  targetMoved: boolean;
  targetInstalled: boolean;
}

export class FileTransaction {
  readonly #filesystem: FileSystemAdapter;

  public constructor(filesystem: FileSystemAdapter) {
    this.#filesystem = filesystem;
  }

  public async apply(
    writes: readonly TransactionWrite[],
    verify: () => Promise<void> = async () => undefined,
  ): Promise<TransactionReceipt> {
    const ledger: LedgerEntry[] = [];
    const createdDirectories: string[] = [];
    try {
      for (const write of writes) {
        await this.ensureDirectories(path.dirname(write.path), createdDirectories);
        const suffix = randomUUID();
        const entry: LedgerEntry = {
          target: write.path,
          temporary: path.join(path.dirname(write.path), `.${path.basename(write.path)}.agent-orchestration-kit-tmp-${suffix}`),
          backup: path.join(path.dirname(write.path), `.${path.basename(write.path)}.agent-orchestration-kit-backup-${suffix}`),
          targetMoved: false,
          targetInstalled: false,
        };
        ledger.push(entry);
        await this.#filesystem.writeFile(entry.temporary, write.content);
        if (await this.#filesystem.exists(entry.target)) {
          await this.#filesystem.rename(entry.target, entry.backup);
          entry.targetMoved = true;
        }
        await this.#filesystem.rename(entry.temporary, entry.target);
        entry.targetInstalled = true;
      }

      await verify();

      const cleanupWarnings: string[] = [];
      for (const entry of ledger) {
        if (!entry.targetMoved) continue;
        try {
          await this.#filesystem.removeFile(entry.backup);
        } catch (error) {
          cleanupWarnings.push(error instanceof Error ? error.message : String(error));
        }
      }
      return {
        written: ledger.map((entry) => entry.target),
        createdDirectories,
        cleanupWarnings,
      };
    } catch (error) {
      const rollbackErrors = await this.rollback(ledger, createdDirectories);
      if (rollbackErrors.length > 0) {
        throw new AggregateError([error, ...rollbackErrors], 'File transaction failed and rollback was incomplete.');
      }
      throw error;
    }
  }

  private async ensureDirectories(directory: string, created: string[]): Promise<void> {
    const missing: string[] = [];
    let current = directory;
    while (!(await this.#filesystem.exists(current))) {
      missing.push(current);
      const parent = path.dirname(current);
      if (parent === current) throw new Error(`Cannot resolve parent directory for ${directory}`);
      current = parent;
    }
    for (const candidate of missing.reverse()) {
      await this.#filesystem.makeDirectory(candidate);
      created.push(candidate);
    }
  }

  private async rollback(entries: readonly LedgerEntry[], directories: readonly string[]): Promise<Error[]> {
    const errors: Error[] = [];
    for (const entry of [...entries].reverse()) {
      try {
        if (entry.targetInstalled) await this.#filesystem.removeFile(entry.target);
        await this.#filesystem.removeFile(entry.temporary);
        if (entry.targetMoved && await this.#filesystem.exists(entry.backup)) {
          await this.#filesystem.rename(entry.backup, entry.target);
        }
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
    for (const directory of [...directories].reverse()) {
      try {
        if (await this.#filesystem.exists(directory)) await this.#filesystem.removeDirectory(directory);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
    return errors;
  }
}
