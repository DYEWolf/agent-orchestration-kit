import path from 'node:path';
import type { FileSystemAdapter } from '../adapters/filesystem/filesystem.js';

export class UnsafePathError extends Error {
  public constructor(candidate: string) {
    super(`Path escapes the selected repository: ${candidate}`);
    this.name = 'UnsafePathError';
  }
}

export class PathShapeError extends Error {
  public constructor(candidate: string) {
    super(`Path has an incompatible file/directory shape: ${candidate}`);
    this.name = 'PathShapeError';
  }
}

export function resolveInsideRepository(root: string, relativePath: string): string {
  if (relativePath.length === 0 || path.isAbsolute(relativePath)) {
    throw new UnsafePathError(relativePath);
  }

  const normalizedRoot = path.resolve(root);
  const resolved = path.resolve(normalizedRoot, relativePath);
  const relation = path.relative(normalizedRoot, resolved);

  if (relation === '' || relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw new UnsafePathError(relativePath);
  }

  return resolved;
}

export async function resolveSafeTarget(
  filesystem: FileSystemAdapter,
  root: string,
  relativePath: string,
): Promise<string> {
  const resolvedRoot = path.resolve(root);
  const target = resolveInsideRepository(resolvedRoot, relativePath);
  const canonicalRoot = await filesystem.realpath(resolvedRoot);
  let existingAncestor = target;
  let ancestorKind = await filesystem.entryKind(existingAncestor);

  while (ancestorKind === undefined) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor || path.relative(resolvedRoot, parent).startsWith(`..${path.sep}`)) {
      throw new UnsafePathError(relativePath);
    }
    existingAncestor = parent;
    ancestorKind = await filesystem.entryKind(existingAncestor);
  }

  let canonicalAncestor: string;
  try {
    canonicalAncestor = await filesystem.realpath(existingAncestor);
  } catch {
    // A dangling symlink is an entry even though its target cannot be resolved.
    // Treat it as unsafe instead of planning a create through it.
    throw new UnsafePathError(relativePath);
  }
  const relation = path.relative(canonicalRoot, canonicalAncestor);
  if (relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw new UnsafePathError(relativePath);
  }
  if (existingAncestor === target && relation === '') {
    throw new UnsafePathError(relativePath);
  }
  if (existingAncestor === target && ancestorKind !== 'file') {
    throw new PathShapeError(relativePath);
  }
  if (existingAncestor !== target && ancestorKind !== 'directory') {
    throw new PathShapeError(relativePath);
  }

  return target;
}

export function isSafeRelativePath(candidate: string): boolean {
  if (
    candidate.length === 0
    || candidate.includes('\0')
    || path.posix.isAbsolute(candidate)
    || path.win32.isAbsolute(candidate)
    || candidate.includes('\\')
  ) {
    return false;
  }
  const segments = candidate.split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

export function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}
