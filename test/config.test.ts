import { describe, expect, it } from 'vitest';
import { profiles, resolveConfig } from '../src/config/profiles.js';
import { workflowConfigSchema } from '../src/config/schema.js';

describe('profile catalog', () => {
  it('renders every approved profile as valid schema version 1 configuration', () => {
    for (const name of Object.keys(profiles) as (keyof typeof profiles)[]) {
      expect(workflowConfigSchema.parse(resolveConfig(name))).toEqual(resolveConfig(name));
    }
  });

  it('marks only profiles that depend on an unvalidated Claude worker as pending', () => {
    expect(profiles['codex-only'].stability).toBe('stable');
    expect(profiles['claude-coordinator'].stability).toBe('stable');
    expect(profiles['claude-only'].stability).toBe('pending-live-validation');
    expect(profiles['codex-coordinator'].stability).toBe('pending-live-validation');
  });

  it('rejects unknown configuration keys instead of silently stripping them', () => {
    expect(() => workflowConfigSchema.parse({
      ...resolveConfig('codex-only'),
      unexpected: true,
    })).toThrow();
    expect(() => workflowConfigSchema.parse({
      ...resolveConfig('codex-only'),
      tracker: { provider: 'github', unexpected: true },
    })).toThrow();
  });
});
