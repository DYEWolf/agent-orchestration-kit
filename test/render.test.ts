import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { renderDesiredArtifacts } from '../src/artifacts/render.js';
import { skillBundleCatalog } from '../src/artifacts/skill-bundle.js';
import { assertNoOriginCollisions, mergeCatalogSkills } from '../src/artifacts/skill-catalog.js';
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

  it.each(['codex-only', 'claude-coordinator', 'claude-only', 'codex-coordinator'] as const)(
    'writes a valid manifest for every owned artifact except the manifest itself (%s)',
    (profile) => {
      const artifacts = renderDesiredArtifacts(resolveConfig(profile));
      const manifestArtifact = artifacts.find((artifact) => artifact.path === '.agent-orchestration-kit/manifest.json');
      expect(manifestArtifact).toBeDefined();
      const manifest = manifestSchema.parse(JSON.parse(manifestArtifact?.content ?? ''));
      expect(manifest.files.map((file) => file.path)).toEqual(
        artifacts
          .filter((artifact) => artifact.path !== '.agent-orchestration-kit/manifest.json')
          .map((artifact) => artifact.path)
          .sort((a, b) => a.localeCompare(b)),
      );
    },
  );

  it('renders Claude compatibility artifacts for every profile that uses Claude', () => {
    const claudeProfiles = ['claude-coordinator', 'claude-only', 'codex-coordinator'] as const;
    for (const profile of claudeProfiles) {
      const artifacts = renderDesiredArtifacts(resolveConfig(profile));
      expect(artifacts.find((artifact) => artifact.path === 'CLAUDE.md')).toBeDefined();
      const wrappers = artifacts.filter((artifact) => artifact.path.startsWith('.claude/skills/'));
      expect(wrappers).toHaveLength(skillBundleCatalog.skills.length);
      for (const wrapper of wrappers) {
        const skillName = wrapper.path.split('/')[2];
        expect(wrapper.path).toBe(`.claude/skills/${skillName}/SKILL.md`);
        expect(wrapper.content).toContain(`Read the canonical \`.agents/skills/${skillName}/SKILL.md\` file`);
        expect(wrapper.content).toContain(`../../../.agents/skills/${skillName}/SKILL.md`);
        expect(wrapper.content.length).toBeLessThan(1_000);
      }
    }
  });

  it.each(['codex-only', 'claude-coordinator', 'claude-only', 'codex-coordinator'] as const)(
    'installs the first-party Campaign skill in %s',
    (profile) => {
      const artifacts = renderDesiredArtifacts(resolveConfig(profile));
      expect(artifacts.find((artifact) => artifact.path === '.agents/skills/campaign/SKILL.md')?.content)
        .toContain('Campaign is a bounded runtime authorization');
      const provenance = artifacts.find((artifact) => artifact.path === '.agents/skills/campaign/PROVENANCE.json')?.content ?? '';
      expect(provenance).toContain('"kind": "first-party"');
      expect(provenance).toContain('"author": "agent-orchestration-kit"');
      expect(provenance).not.toContain('mattpocock');
      if (profile === 'codex-only') {
        expect(artifacts.some((artifact) => artifact.path === '.claude/skills/campaign/SKILL.md')).toBe(false);
      } else {
        expect(artifacts.find((artifact) => artifact.path === '.claude/skills/campaign/SKILL.md')).toBeDefined();
      }
    },
  );

  it('derives third-party notices from upstream catalog membership only', () => {
    const notices = renderDesiredArtifacts(resolveConfig('codex-only'))
      .find((artifact) => artifact.path === '.agents/THIRD_PARTY_NOTICES.md')?.content ?? '';
    expect(notices).not.toContain('`campaign`');
    for (const skill of skillBundleCatalog.skills) {
      if (skill.origin.kind === 'upstream') expect(notices).toContain(`\`${skill.name}\``);
    }
  });

  it('rejects an upstream sync collision instead of replacing Campaign provenance', () => {
    expect(() => assertNoOriginCollisions(['campaign'], ['campaign']))
      .toThrow('Upstream skill collides with first-party skill: campaign');
    expect(() => assertNoOriginCollisions(['implement'], ['campaign'])).not.toThrow();
  });

  it('preserves arbitrary first-party entries byte-for-byte and sorted across an upstream refresh', () => {
    const upstream = {
      name: 'upstream-skill',
      files: { 'SKILL.md': 'upstream' },
      origin: {
        kind: 'upstream' as const,
        upstreamPath: 'skills/upstream-skill/SKILL.md',
        originalContentHash: 'a'.repeat(64),
        overlayVersion: '1',
        renderedContentHash: 'b'.repeat(64),
        supportFiles: [],
        patch: { kind: 'mechanical' },
      },
    };
    const firstParty = {
      name: 'arbitrary-first-party',
      files: {
        'SKILL.md': 'first-party body',
        'agents/openai.yaml': 'metadata',
        'references/details.md': 'reference',
      },
      origin: {
        kind: 'first-party' as const,
        author: 'agent-orchestration-kit' as const,
        sourcePath: 'templates/skills/arbitrary-first-party',
        sourceContentHash: 'c'.repeat(64),
        renderedContentHash: 'd'.repeat(64),
        files: [
          { path: 'SKILL.md', hash: 'e'.repeat(64) },
          { path: 'agents/openai.yaml', hash: 'f'.repeat(64) },
          { path: 'references/details.md', hash: '0'.repeat(64) },
        ],
      },
    };

    const merged = mergeCatalogSkills([upstream], [firstParty]);

    expect(merged.map((skill) => skill.name)).toEqual(['arbitrary-first-party', 'upstream-skill']);
    expect(merged[0]).toEqual(firstParty);
    expect(merged[1]).toEqual(upstream);
    expect(firstParty.origin.files).toEqual([
      { path: 'SKILL.md', hash: 'e'.repeat(64) },
      { path: 'agents/openai.yaml', hash: 'f'.repeat(64) },
      { path: 'references/details.md', hash: '0'.repeat(64) },
    ]);
  });

  it('records deterministic hashes for every first-party source file in runtime provenance', () => {
    const campaign = skillBundleCatalog.skills.find((skill) => skill.name === 'campaign');
    expect(campaign?.origin.kind).toBe('first-party');
    if (campaign?.origin.kind !== 'first-party') return;

    const filePaths = Object.keys(campaign.files).sort((left, right) => left.localeCompare(right));
    expect(campaign.origin.files.map((file) => file.path)).toEqual(filePaths);
    for (const file of campaign.origin.files) {
      expect(file.hash).toBe(createHash('sha256').update(campaign.files[file.path] ?? '', 'utf8').digest('hex'));
    }

    const provenance = renderDesiredArtifacts(resolveConfig('codex-only'))
      .find((artifact) => artifact.path === '.agents/skills/campaign/PROVENANCE.json');
    expect(JSON.parse(provenance?.content ?? '{}')).toMatchObject({ files: campaign.origin.files });
  });

  it('makes CLAUDE.md import the root constitution and distinguishes skill locations', () => {
    const claude = renderDesiredArtifacts(resolveConfig('claude-coordinator'))
      .find((artifact) => artifact.path === 'CLAUDE.md');
    expect(claude).toBeDefined();
    expect(claude?.content).toContain('@AGENTS.md');
    expect(claude?.content).toContain('root `AGENTS.md`');
    expect(claude?.content).toContain('Canonical skill bodies live under `.agents/skills/`');
    expect(claude?.content).toContain('lightweight project skill wrappers under `.claude/skills/`');
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
