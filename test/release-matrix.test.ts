import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  formatReleaseMatrixValidation,
  validateGitAttributes,
  validateReleaseMatrix,
} from '../scripts/validate-release-matrix.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(repositoryRoot, '.github/workflows/release-matrix.yml');
const attributesPath = path.join(repositoryRoot, '.gitattributes');

describe('release matrix contract', () => {
  it('accepts the repository workflow and reports a deterministic pass', async () => {
    const source = await readFile(workflowPath, 'utf8');
    const result = validateReleaseMatrix(source);

    expect(result).toEqual({ valid: true, errors: [] });
    expect(formatReleaseMatrixValidation(result)).toEqual({
      exitCode: 0,
      stdout: 'Release matrix validation PASS: nine explicit Node/OS pairs satisfy the repository contract.\n',
      stderr: '',
    });
  });

  it('rejects missing LF normalization for hash-sensitive tracked content', async () => {
    const source = await readFile(attributesPath, 'utf8');
    const missingNormalization = source.replace('* text=auto eol=lf\n', '');
    const result = validateGitAttributes(missingNormalization);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      '`.gitattributes` must normalize tracked text to LF with `* text=auto eol=lf`.',
    );
  });

  it('keeps tracked text LF while preserving Windows command fixture CRLF semantics', async () => {
    const attributes = await readFile(attributesPath, 'utf8');

    expect(attributes).toContain('* text=auto eol=lf\n');
    expect(attributes).toContain('*.bat text eol=crlf\n');
    expect(attributes).toContain('*.cmd text eol=crlf\n');
    expect(validateGitAttributes(attributes)).toEqual({ valid: true, errors: [] });
  });

  it('rejects drift from the verified v7 action majors', async () => {
    const source = await readFile(workflowPath, 'utf8');
    const drifts = [
      ['actions/checkout@v7', 'actions/checkout@v6'],
      ['actions/setup-node@v7', 'actions/setup-node@v6'],
      ['actions/upload-artifact@v7', 'actions/upload-artifact@v6'],
    ] as const;

    for (const [verified, stale] of drifts) {
      const result = validateReleaseMatrix(source.replace(verified, stale));

      expect(result.valid, `${stale} should be rejected`).toBe(false);
    }
  });

  it('reports the exact actionable pair when an in-memory fixture drifts', async () => {
    const source = await readFile(workflowPath, 'utf8');
    const invalidFixture = source.replace(
      "          - os: windows-latest\n            node: '26'",
      "          - os: windows-latest\n            node: '27'",
    );

    const result = validateReleaseMatrix(invalidFixture);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'jobs.release.strategy.matrix.include must contain exactly the nine supported OS/Node pairs; missing windows-latest/node 26; unexpected windows-latest/node 27.',
    );
    expect(formatReleaseMatrixValidation(result).stderr).toContain(
      'missing windows-latest/node 26; unexpected windows-latest/node 27',
    );
  });
});
