import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { CLI_VERSION } from '../src/version.js';

describe('version metadata', () => {
  it('keeps the runtime version aligned with package.json', async () => {
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(CLI_VERSION).toBe(packageJson.version);
  });
});
