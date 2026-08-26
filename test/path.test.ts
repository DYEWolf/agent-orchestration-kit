import path from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { resolveInsideRepository, UnsafePathError } from '../src/shared/path.js';

describe('repository path validation', () => {
  const root = path.resolve('/safe/repository');

  it('accepts nested relative paths', () => {
    expect(resolveInsideRepository(root, '.orca-kit/config.yaml')).toBe(
      path.join(root, '.orca-kit/config.yaml'),
    );
  });

  it('rejects absolute paths and traversal', () => {
    expect(() => resolveInsideRepository(root, '../outside')).toThrow(UnsafePathError);
    expect(() => resolveInsideRepository(root, path.resolve('/outside'))).toThrow(UnsafePathError);
  });

  it('never resolves generated simple segments outside the root', () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-zA-Z0-9._-]+$/u).filter(Boolean), { minLength: 1, maxLength: 5 }),
        (segments) => {
          fc.pre(!segments.includes('..') && !segments.includes('.'));
          const resolved = resolveInsideRepository(root, segments.join(path.sep));
          const relation = path.relative(root, resolved);
          expect(relation === '..' || relation.startsWith(`..${path.sep}`)).toBe(false);
        },
      ),
    );
  });
});
