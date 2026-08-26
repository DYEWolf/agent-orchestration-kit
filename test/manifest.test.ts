import { describe, expect, it } from 'vitest';
import { manifestSchema } from '../src/workflow-project/manifest.js';

const hash = 'a'.repeat(64);

function manifestWith(paths: string[]) {
  return {
    schemaVersion: 1,
    cliVersion: '0.1.0',
    bundleVersion: 'phase-1',
    files: paths.map((path) => ({ path, hash, ownership: 'full' })),
  };
}

describe('manifest schema trust boundary', () => {
  it.each(['../outside', '/absolute', 'C:\\outside', 'a/../outside', 'a\\outside'])('rejects unsafe path %s', (path) => {
    expect(() => manifestSchema.parse(manifestWith([path]))).toThrow();
  });

  it('rejects duplicate paths', () => {
    expect(() => manifestSchema.parse(manifestWith(['a', 'a']))).toThrow(/Duplicate manifest path/u);
  });

  it('rejects unknown fields', () => {
    expect(() => manifestSchema.parse({ ...manifestWith(['a']), extra: true })).toThrow();
  });
});
