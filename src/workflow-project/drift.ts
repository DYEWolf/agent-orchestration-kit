import type { FileSystemAdapter } from '../adapters/filesystem/filesystem.js';
import { inspectManagedBlock } from '../artifacts/managed-block.js';
import { sha256 } from '../shared/hash.js';
import { PathShapeError, resolveSafeTarget, UnsafePathError } from '../shared/path.js';
import type { Manifest } from './manifest.js';

export interface DriftItem {
  readonly path: string;
  readonly status: 'missing' | 'modified' | 'malformed-managed-block' | 'unsafe-path' | 'invalid-path-shape' | 'invalid-manifest';
  readonly expectedHash: string;
  readonly actualHash?: string;
}

export interface DriftReport {
  readonly items: readonly DriftItem[];
  readonly clean: boolean;
}

export async function computeDrift(
  filesystem: FileSystemAdapter,
  repositoryRoot: string,
  manifest: Manifest,
): Promise<DriftReport> {
  const items: DriftItem[] = [];

  for (const entry of [...manifest.files].sort((a, b) => a.path.localeCompare(b.path))) {
    let absolutePath: string;
    try {
      absolutePath = await resolveSafeTarget(filesystem, repositoryRoot, entry.path);
    } catch (error) {
      if (!(error instanceof UnsafePathError) && !(error instanceof PathShapeError)) throw error;
      items.push({
        path: entry.path,
        status: error instanceof UnsafePathError ? 'unsafe-path' : 'invalid-path-shape',
        expectedHash: entry.hash,
      });
      continue;
    }
    if (!(await filesystem.exists(absolutePath))) {
      items.push({ path: entry.path, status: 'missing', expectedHash: entry.hash });
      continue;
    }

    const source = await filesystem.readFile(absolutePath);
    if (entry.ownership === 'managed-block') {
      const block = inspectManagedBlock(source);
      if (block.status !== 'valid' || block.content === undefined) {
        items.push({
          path: entry.path,
          status: 'malformed-managed-block',
          expectedHash: entry.hash,
        });
        continue;
      }
      const actualHash = sha256(block.content);
      if (actualHash !== entry.hash) {
        items.push({ path: entry.path, status: 'modified', expectedHash: entry.hash, actualHash });
      }
      continue;
    }

    const actualHash = sha256(source);
    if (actualHash !== entry.hash) {
      items.push({ path: entry.path, status: 'modified', expectedHash: entry.hash, actualHash });
    }
  }

  return { items, clean: items.length === 0 };
}
