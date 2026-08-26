import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { InMemoryFileSystem } from '../src/adapters/filesystem/in-memory-filesystem.js';
import { FileTransaction } from '../src/workflow-project/transactions.js';

describe('FileTransaction', () => {
  it('restores every modified file and removes created files after a failure', async () => {
    class FailingFileSystem extends InMemoryFileSystem {
      #renameCount = 0;

      public override async rename(source: string, destination: string): Promise<void> {
        this.#renameCount += 1;
        if (this.#renameCount === 3) throw new Error('injected rename failure');
        await super.rename(source, destination);
      }
    }

    const root = path.resolve('/transaction-fixture');
    const filesystem = new FailingFileSystem(root, { 'existing.txt': 'before\n' });
    const before = filesystem.snapshot();
    const transaction = new FileTransaction(filesystem);
    await expect(transaction.apply([
      { path: path.join(root, 'nested/new.txt'), content: 'new\n' },
      { path: path.join(root, 'existing.txt'), content: 'after\n' },
    ])).rejects.toThrow('injected rename failure');
    expect(filesystem.snapshot()).toEqual(before);
  });

  it('writes all files when the operation succeeds', async () => {
    const root = path.resolve('/transaction-success');
    const filesystem = new InMemoryFileSystem(root, { 'existing.txt': 'before\n' });
    const receipt = await new FileTransaction(filesystem).apply([
      { path: path.join(root, 'nested/new.txt'), content: 'new\n' },
      { path: path.join(root, 'existing.txt'), content: 'after\n' },
    ]);
    expect(await filesystem.readFile(path.join(root, 'nested/new.txt'))).toBe('new\n');
    expect(await filesystem.readFile(path.join(root, 'existing.txt'))).toBe('after\n');
    expect(receipt.cleanupWarnings).toEqual([]);
  });

  it('rolls back all writes when post-write verification fails', async () => {
    const root = path.resolve('/transaction-verification');
    const filesystem = new InMemoryFileSystem(root, { 'existing.txt': 'before\n' });
    const before = filesystem.snapshot();
    await expect(new FileTransaction(filesystem).apply([
      { path: path.join(root, 'new.txt'), content: 'new\n' },
      { path: path.join(root, 'existing.txt'), content: 'after\n' },
    ], async () => {
      throw new Error('verification failed');
    })).rejects.toThrow('verification failed');
    expect(filesystem.snapshot()).toEqual(before);
  });
});
