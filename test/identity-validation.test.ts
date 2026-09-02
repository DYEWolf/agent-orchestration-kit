import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { formatValidationResult, validateIdentity } from '../scripts/validate-identity.js';

const historicalIdentity = ['orca', '-', 'kit'].join('');
const canonicalIdentity = 'agent-orchestration-kit';
const fixtureRoots: string[] = [];

afterEach(async () => {
  await Promise.all(fixtureRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function createFixture(): Promise<{ root: string; outside: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'identity-validation-root-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'identity-validation-outside-'));
  fixtureRoots.push(root, outside);
  return { root, outside };
}

describe('identity validation', () => {
  it('rejects legacy identifiers in ordinary paths and content', async () => {
    const { root } = await createFixture();
    const ordinaryPath = `${historicalIdentity.toUpperCase()}.txt`;
    await writeFile(path.join(root, ordinaryPath), `content includes ${historicalIdentity}\n`);

    const result = await validateIdentity(root);

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: ordinaryPath,
        source: 'path',
        value: historicalIdentity.toUpperCase(),
        reason: 'unallowlisted',
      }),
      expect.objectContaining({
        path: ordinaryPath,
        line: 1,
        source: 'content',
        value: historicalIdentity,
        reason: 'unallowlisted',
      }),
    ]));
    expect(result.violations).toHaveLength(2);
  });

  it('rejects a legacy identifier in a symlink path without following its target', async () => {
    const { root } = await createFixture();
    await writeFile(path.join(root, 'safe-target.txt'), 'clean target\n');
    await symlink('safe-target.txt', path.join(root, `${historicalIdentity}.link`));

    const result = await validateIdentity(root);

    expect(result.violations).toEqual([
      expect.objectContaining({
        path: `${historicalIdentity}.link`,
        source: 'path',
        value: historicalIdentity,
        reason: 'unallowlisted',
      }),
    ]);
  });

  it('rejects a legacy identifier in broken external symlink target text', async () => {
    const { root, outside } = await createFixture();
    const target = path.join(outside, `${historicalIdentity}-missing.txt`);
    await symlink(target, path.join(root, 'broken-link'));

    const result = await validateIdentity(root);

    expect(result.violations).toEqual([
      expect.objectContaining({
        path: 'broken-link',
        source: 'target',
        value: historicalIdentity,
        reason: 'unallowlisted',
      }),
    ]);
    expect(formatValidationResult(result).stderr).toContain('broken-link:target');
  });

  it('does not read external symlink targets or traverse symlinked directories', async () => {
    const { root, outside } = await createFixture();
    const externalFile = path.join(outside, 'external-file.txt');
    await writeFile(externalFile, `must not be read: ${historicalIdentity}\n`);
    await symlink(externalFile, path.join(root, 'external-file-link'));

    const externalDirectory = path.join(outside, 'external-directory');
    await mkdir(externalDirectory);
    await writeFile(path.join(externalDirectory, `${historicalIdentity}.txt`), historicalIdentity);
    await symlink(externalDirectory, path.join(root, 'external-directory-link'));

    const result = await validateIdentity(root);

    expect(result).toEqual({ allowed: [], violations: [] });
  });

  it('keeps clean fixtures passing and limits historical matches to the intended allowlist', async () => {
    const { root } = await createFixture();
    const adrPath = path.join(root, 'docs', 'adr', '0001-use-generic-product-identity.md');
    const researchPath = path.join(root, 'docs', 'research', `${historicalIdentity}-name-risk.md`);
    const specificationPath = path.join(root, 'docs', 'approved-specification.md');
    await mkdir(path.dirname(adrPath), { recursive: true });
    await mkdir(path.dirname(researchPath), { recursive: true });
    await writeFile(adrPath, `historical record: ${historicalIdentity}\n`);
    await writeFile(researchPath, `research record: ${historicalIdentity}\n`);
    await writeFile(specificationPath, `superseded decision for ${canonicalIdentity}: ${historicalIdentity}\n`);

    const result = await validateIdentity(root);
    const firstOutput = formatValidationResult(result);
    const secondOutput = formatValidationResult(await validateIdentity(root));

    expect(result.violations).toEqual([]);
    expect(result.allowed).toHaveLength(4);
    expect(result.allowed.map(({ path: matchPath, source, reason }) => ({ path: matchPath, source, reason }))).toEqual([
      { path: 'docs/adr/0001-use-generic-product-identity.md', source: 'content', reason: 'historical-record' },
      { path: 'docs/approved-specification.md', source: 'content', reason: 'superseded-decision' },
      { path: `docs/research/${historicalIdentity}-name-risk.md`, source: 'path', reason: 'historical-record' },
      { path: `docs/research/${historicalIdentity}-name-risk.md`, source: 'content', reason: 'historical-record' },
    ]);
    expect(firstOutput).toEqual(secondOutput);
    expect(firstOutput).toMatchObject({ exitCode: 0, stderr: '', stdout: expect.stringContaining('Allowed historical residual matches: 4') });
  });
});
