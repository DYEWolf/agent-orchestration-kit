import { describe, expect, it } from 'vitest';
import { renderDesiredArtifacts } from '../src/artifacts/render.js';
import { resolveConfig } from '../src/config/profiles.js';
import { manifestSchema } from '../src/workflow-project/manifest.js';

describe('desired artifact rendering', () => {
  it('is deterministic and codex-only emits no Claude compatibility artifacts', () => {
    const first = renderDesiredArtifacts(resolveConfig('codex-only'));
    const second = renderDesiredArtifacts(resolveConfig('codex-only'));
    expect(second).toEqual(first);
    expect(first.some((artifact) => artifact.path === 'CLAUDE.md')).toBe(false);
    expect(first.some((artifact) => artifact.path.startsWith('.claude/'))).toBe(false);
  });

  it('writes a valid manifest for every owned artifact except the manifest itself', () => {
    const artifacts = renderDesiredArtifacts(resolveConfig('codex-only'));
    const manifestArtifact = artifacts.find((artifact) => artifact.path === '.orca-kit/manifest.json');
    expect(manifestArtifact).toBeDefined();
    const manifest = manifestSchema.parse(JSON.parse(manifestArtifact?.content ?? ''));
    expect(manifest.files.map((file) => file.path)).toEqual(
      artifacts
        .filter((artifact) => artifact.path !== '.orca-kit/manifest.json')
        .map((artifact) => artifact.path)
        .sort((a, b) => a.localeCompare(b)),
    );
  });

  it('renders Wayfinder metadata without requiring a label taxonomy', () => {
    const artifacts = renderDesiredArtifacts(resolveConfig('codex-only'));
    const tracker = artifacts.find((artifact) => artifact.path === 'docs/agents/issue-tracker.md')?.content ?? '';
    const wayfinder = artifacts.find((artifact) => artifact.path === '.agents/skills/wayfinder/SKILL.md')?.content ?? '';

    for (const content of [tracker, wayfinder]) {
      expect(content).toContain('Type: wayfinder-map');
      expect(content).toContain('Type: wayfinder-<research|prototype|grilling|task>');
      expect(content).toContain('Part of: #<map>');
      expect(content).not.toMatch(/wayfinder:(?:map|research|prototype|grilling|task)/u);
    }

    expect(tracker).toContain('Blocked by: #<issue>');
    expect(tracker).toContain('never implied by `Type: wayfinder-task`');
  });
});
