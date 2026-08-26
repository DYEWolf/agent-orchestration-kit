import catalogJson from '../generated/skill-bundle.json' with { type: 'json' };
import { z } from 'zod';
import type { DesiredArtifact } from './render.js';

const catalogSchema = z.strictObject({
  schemaVersion: z.literal(1),
  upstreamRepository: z.string().url(),
  upstreamCommit: z.string().regex(/^[a-f0-9]{40}$/u),
  overlayVersion: z.string().min(1),
  license: z.strictObject({
    spdx: z.literal('MIT'),
    hash: z.string().regex(/^[a-f0-9]{64}$/u),
    content: z.string().min(1),
  }),
  skills: z.array(z.strictObject({
    name: z.string().min(1),
    upstreamPath: z.string().min(1),
    originalContentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    renderedContentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    overlayVersion: z.string().min(1),
    files: z.record(z.string(), z.string()),
    supportFiles: z.array(z.strictObject({
      path: z.string().min(1),
      hash: z.string().regex(/^[a-f0-9]{64}$/u),
    })),
    patch: z.record(z.string(), z.unknown()),
  })),
});

export const skillBundleCatalog = catalogSchema.parse(catalogJson);

export function renderSkillArtifacts(): DesiredArtifact[] {
  const artifacts: DesiredArtifact[] = [];
  for (const skill of skillBundleCatalog.skills) {
    for (const [relativePath, content] of Object.entries(skill.files)) {
      artifacts.push({
        path: `.agents/skills/${skill.name}/${relativePath}`,
        ownership: 'full',
        content,
      });
    }
    artifacts.push({
      path: `.agents/skills/${skill.name}/PROVENANCE.json`,
      ownership: 'full',
      content: `${JSON.stringify({
        upstreamRepository: skillBundleCatalog.upstreamRepository,
        upstreamPath: skill.upstreamPath,
        upstreamCommit: skillBundleCatalog.upstreamCommit,
        originalContentHash: skill.originalContentHash,
        overlayVersion: skill.overlayVersion,
        renderedContentHash: skill.renderedContentHash,
        supportFiles: skill.supportFiles,
        patch: skill.patch,
      }, null, 2)}\n`,
    });
  }
  return artifacts.sort((a, b) => a.path.localeCompare(b.path));
}

export function renderSkillNotices(): string {
  const inventory = skillBundleCatalog.skills
    .map((skill) => `- \`${skill.name}\`: \`${skill.upstreamPath}\``)
    .join('\n');
  return [
    '# Third-party notices',
    '',
    'The following skill snapshots were adapted for Orca orchestration. This project is not affiliated with, endorsed by, or an official product of Orca or its maintainers.',
    '',
    `Upstream repository: ${skillBundleCatalog.upstreamRepository}`,
    `Pinned upstream commit: \`${skillBundleCatalog.upstreamCommit}\``,
    `Orca overlay version: \`${skillBundleCatalog.overlayVersion}\``,
    '',
    '## Included skills',
    '',
    inventory,
    '',
    '## Upstream license',
    '',
    '```text',
    skillBundleCatalog.license.content.trim(),
    '```',
    '',
  ].join('\n');
}
