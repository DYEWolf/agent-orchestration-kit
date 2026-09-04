import catalogJson from '../generated/skill-bundle.json' with { type: 'json' };
import { z } from 'zod';
import type { DesiredArtifact } from './render.js';
import { hashFileTree, type CatalogSkill, type SkillBundleCatalog } from './skill-catalog.js';

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const fileHashSchema = z.strictObject({ path: z.string().min(1), hash: hashSchema });

const sortedFileHashesSchema = z.array(fileHashSchema).superRefine((files, context) => {
  for (let index = 0; index < files.length; index += 1) {
    const current = files[index];
    const previous = files[index - 1];
    if (current === undefined) continue;
    if (previous !== undefined && previous.path.localeCompare(current.path) >= 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'file hash paths must be sorted and unique', path: [index, 'path'] });
    }
  }
});

const reconciliationSchema = z.strictObject({
  kind: z.literal('manual'),
  overlayVersion: z.literal('2'),
  upstreamTreeHash: hashSchema,
  renderedTreeHash: hashSchema,
  upstreamFiles: sortedFileHashesSchema.min(1),
  renderedFiles: sortedFileHashesSchema.min(1),
  changes: z.array(z.string().trim().min(1)).min(1),
});

const upstreamOriginSchema = z.strictObject({
  kind: z.literal('upstream'),
  upstreamPath: z.string().min(1),
  originalContentHash: hashSchema,
  overlayVersion: z.literal('2'),
  renderedContentHash: hashSchema,
  supportFiles: sortedFileHashesSchema,
  reconciliation: reconciliationSchema,
});

const firstPartyOriginSchema = z.strictObject({
  kind: z.literal('first-party'),
  author: z.literal('agent-orchestration-kit'),
  sourcePath: z.string().min(1),
  sourceContentHash: hashSchema,
  renderedContentHash: hashSchema,
  files: sortedFileHashesSchema.min(1),
});

const catalogSchema = z.strictObject({
  schemaVersion: z.literal(1),
  upstreamRepository: z.string().url(),
  upstreamCommit: z.string().regex(/^[a-f0-9]{40}$/u),
  overlayVersion: z.literal('2'),
  license: z.strictObject({
    spdx: z.literal('MIT'),
    hash: z.string().regex(/^[a-f0-9]{64}$/u),
    content: z.string().min(1),
  }),
  skills: z.array(z.strictObject({
    name: z.string().min(1),
    files: z.record(z.string(), z.string()),
    origin: z.discriminatedUnion('kind', [upstreamOriginSchema, firstPartyOriginSchema]),
  })).min(1).superRefine((skills, context) => {
    for (let index = 1; index < skills.length; index += 1) {
      const previous = skills[index - 1];
      const current = skills[index];
      if (previous !== undefined && current !== undefined && previous.name >= current.name) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'skill names must be sorted and unique', path: [index, 'name'] });
      }
    }
  }),
});

export const skillBundleCatalog = catalogSchema.parse(catalogJson) as unknown as SkillBundleCatalog;

/** Generate repository-local and installed provenance through one code path. */
export function renderSkillProvenance(skill: CatalogSkill): string {
  const provenance = skill.origin.kind === 'upstream'
    ? {
        ...skill.origin,
        upstreamRepository: skillBundleCatalog.upstreamRepository,
        upstreamCommit: skillBundleCatalog.upstreamCommit,
      }
    : skill.origin;
  return `${JSON.stringify(provenance, null, 2)}\n`;
}

export { hashFileTree };

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
      content: renderSkillProvenance(skill),
    });
  }
  return artifacts.sort((a, b) => a.path.localeCompare(b.path));
}

export function renderSkillNotices(): string {
  const inventory = skillBundleCatalog.skills
    .flatMap((skill) => skill.origin.kind === 'upstream'
      ? [`- \`${skill.name}\`: \`${skill.origin.upstreamPath}\``]
      : [])
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
    '## Included third-party skills',
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
