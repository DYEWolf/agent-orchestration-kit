import { describe, expect, it } from 'vitest';
import { renderDesiredArtifacts } from '../src/artifacts/render.js';
import { resolveConfig } from '../src/config/profiles.js';
import { manifestSchema } from '../src/workflow-project/manifest.js';

describe('desired artifact rendering', () => {
  it('is deterministic and codex-only emits no Claude artifacts or references', () => {
    const first = renderDesiredArtifacts(resolveConfig('codex-only'));
    const second = renderDesiredArtifacts(resolveConfig('codex-only'));
    expect(second).toEqual(first);
    expect(first.some((artifact) => artifact.path === 'CLAUDE.md')).toBe(false);
    expect(first.some((artifact) => artifact.path.startsWith('.claude/'))).toBe(false);
    expect(first.map((artifact) => artifact.content).join('\n')).not.toMatch(/claude/iu);
  });

  it('writes a valid manifest for every owned artifact except the manifest itself', () => {
    const artifacts = renderDesiredArtifacts(resolveConfig('codex-only'));
    const manifestArtifact = artifacts.find((artifact) => artifact.path === '.orca-kit/manifest.json');
    expect(manifestArtifact).toBeDefined();
    const manifest = manifestSchema.parse(JSON.parse(manifestArtifact?.content ?? ''));
    expect(manifest.files.map((file) => file.path)).toEqual(
      artifacts.filter((artifact) => artifact.path !== '.orca-kit/manifest.json').map((artifact) => artifact.path).sort(),
    );
  });
});
