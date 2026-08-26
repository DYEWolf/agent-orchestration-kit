import path from 'node:path';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execa } from 'execa';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upstreamRepository = 'https://github.com/mattpocock/skills';
const upstreamCommit = '6654f6b60cd9d5be8b54c6fafe44346dabeb3b76';
const overlayVersion = '1';

const skills = {
  'ask-matt': 'skills/engineering/ask-matt',
  'grill-with-docs': 'skills/engineering/grill-with-docs',
  'to-spec': 'skills/engineering/to-spec',
  'to-tickets': 'skills/engineering/to-tickets',
  implement: 'skills/engineering/implement',
  wayfinder: 'skills/engineering/wayfinder',
  'improve-codebase-architecture': 'skills/engineering/improve-codebase-architecture',
  handoff: 'skills/productivity/handoff',
  grilling: 'skills/productivity/grilling',
  'domain-modeling': 'skills/engineering/domain-modeling',
  research: 'skills/engineering/research',
  prototype: 'skills/engineering/prototype',
  tdd: 'skills/engineering/tdd',
  'diagnosing-bugs': 'skills/engineering/diagnosing-bugs',
  'codebase-design': 'skills/engineering/codebase-design',
  'code-review': 'skills/engineering/code-review',
  'resolving-merge-conflicts': 'skills/engineering/resolving-merge-conflicts',
} as const;

const supportBySkill: Readonly<Record<keyof typeof skills, readonly string[]>> = {
  'ask-matt': [],
  'grill-with-docs': [],
  'to-spec': [],
  'to-tickets': [],
  implement: [],
  wayfinder: [],
  'improve-codebase-architecture': ['HTML-REPORT.md'],
  handoff: [],
  grilling: [],
  'domain-modeling': ['ADR-FORMAT.md', 'CONTEXT-FORMAT.md'],
  research: [],
  prototype: ['LOGIC.md', 'UI.md'],
  tdd: ['mocking.md', 'tests.md'],
  'diagnosing-bugs': ['scripts/hitl-loop.template.sh'],
  'codebase-design': ['DEEPENING.md', 'DESIGN-IT-TWICE.md'],
  'code-review': [],
  'resolving-merge-conflicts': [],
};

interface UpstreamFrontmatter {
  readonly name?: string;
  readonly description?: string;
  readonly 'disable-model-invocation'?: boolean;
}

interface CatalogSkill {
  readonly name: string;
  readonly upstreamPath: string;
  readonly originalContentHash: string;
  readonly renderedContentHash: string;
  readonly overlayVersion: string;
  readonly files: Readonly<Record<string, string>>;
  readonly supportFiles: readonly { path: string; hash: string }[];
  readonly patch: Readonly<Record<string, unknown>>;
}

const temporary = await mkdtemp(path.join(tmpdir(), 'orca-kit-upstream-sync-'));
try {
  await execa('git', ['clone', '--quiet', '--filter=blob:none', '--no-checkout', `${upstreamRepository}.git`, temporary]);
  await execa('git', ['-C', temporary, 'checkout', '--quiet', upstreamCommit]);
  const actualCommit = (await execa('git', ['-C', temporary, 'rev-parse', 'HEAD'])).stdout.trim();
  if (actualCommit !== upstreamCommit) throw new Error(`Expected ${upstreamCommit}, received ${actualCommit}`);

  const sharedOverlay = await readFile(path.join(repositoryRoot, 'templates/overlays/shared.md'), 'utf8');
  const askMattReplacement = await readFile(path.join(repositoryRoot, 'templates/patches/ask-matt-body.md'), 'utf8');
  const license = await readFile(path.join(temporary, 'LICENSE'), 'utf8');
  const catalogSkills: CatalogSkill[] = [];

  for (const [name, upstreamDirectory] of Object.entries(skills)) {
    const sourceDirectory = path.join(temporary, upstreamDirectory);
    const upstreamSkillPath = path.join(sourceDirectory, 'SKILL.md');
    const original = await readFile(upstreamSkillPath, 'utf8');
    const parsed = parseSkill(original);
    if (parsed.frontmatter.name !== name) throw new Error(`Unexpected skill name in ${upstreamDirectory}`);

    const patch = name === 'ask-matt'
      ? { kind: 'replacement', source: 'templates/patches/ask-matt-body.md', reason: 'Router must reference only installed skills.' }
      : {
          kind: 'mechanical',
          replacements: ['adapter-specific slash invocations -> neutral skill names', 'setup skill fallback -> installed GitHub tracker documentation'],
        };
    const patchedBody = name === 'ask-matt' ? askMattReplacement : adaptBody(parsed.body);
    const frontmatter = stringifyYaml({
      name,
      description: parsed.frontmatter.description ?? `Orca-adapted ${name} procedure`,
    }).trim();
    const rendered = `---\n${frontmatter}\n---\n\n${sharedOverlay.trim()}\n\n## Pinned upstream procedure\n\n${patchedBody.trim()}\n`;

    const files: Record<string, string> = {
      'SKILL.md': rendered,
      'agents/openai.yaml': renderOpenAiMetadata(
        name,
        parsed.frontmatter.description ?? `Orca-adapted ${name} procedure`,
        parsed.frontmatter['disable-model-invocation'] === true,
      ),
    };
    const supportFiles: { path: string; hash: string }[] = [];
    for (const relativePath of supportBySkill[name as keyof typeof skills]) {
      const content = await readFile(path.join(sourceDirectory, relativePath), 'utf8');
      files[relativePath] = content;
      supportFiles.push({ path: `${upstreamDirectory}/${relativePath}`, hash: sha256(content) });
    }

    const snapshotRoot = path.join(repositoryRoot, 'templates/skills', name);
    await rm(snapshotRoot, { recursive: true, force: true });
    await mkdir(path.join(snapshotRoot, 'upstream'), { recursive: true });
    await mkdir(path.join(snapshotRoot, 'rendered'), { recursive: true });
    await writeFile(path.join(snapshotRoot, 'upstream/SKILL.md'), original, 'utf8');
    await writeFile(path.join(snapshotRoot, 'rendered/SKILL.md'), rendered, 'utf8');
    await writeFile(path.join(snapshotRoot, 'overlay.md'), sharedOverlay, 'utf8');
    await writeFile(path.join(snapshotRoot, 'patch.json'), `${JSON.stringify(patch, null, 2)}\n`, 'utf8');
    for (const [relativePath, content] of Object.entries(files)) {
      if (relativePath === 'SKILL.md' || relativePath === 'agents/openai.yaml') continue;
      const destination = path.join(snapshotRoot, 'upstream', relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, content, 'utf8');
    }

    const catalogSkill: CatalogSkill = {
      name,
      upstreamPath: `${upstreamDirectory}/SKILL.md`,
      originalContentHash: sha256(original),
      renderedContentHash: sha256(rendered),
      overlayVersion,
      files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
      supportFiles: supportFiles.sort((a, b) => a.path.localeCompare(b.path)),
      patch,
    };
    catalogSkills.push(catalogSkill);
    await writeFile(path.join(snapshotRoot, 'provenance.json'), `${JSON.stringify({
      upstreamRepository,
      upstreamPath: catalogSkill.upstreamPath,
      upstreamCommit,
      originalContentHash: catalogSkill.originalContentHash,
      overlayVersion,
      renderedContentHash: catalogSkill.renderedContentHash,
      supportFiles: catalogSkill.supportFiles,
    }, null, 2)}\n`, 'utf8');
  }

  const catalog = {
    schemaVersion: 1,
    upstreamRepository,
    upstreamCommit,
    overlayVersion,
    license: { spdx: 'MIT', hash: sha256(license), content: license },
    skills: catalogSkills.sort((a, b) => a.name.localeCompare(b.name)),
  };
  await mkdir(path.join(repositoryRoot, 'src/generated'), { recursive: true });
  await writeFile(path.join(repositoryRoot, 'src/generated/skill-bundle.json'), `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  await writeFile(path.join(repositoryRoot, 'templates/skills/catalog.json'), `${JSON.stringify({
    ...catalog,
    skills: catalog.skills.map(({ files: _files, ...skill }) => skill),
  }, null, 2)}\n`, 'utf8');
  const inventory = catalog.skills.map((skill) => `- ${skill.name}: ${skill.upstreamPath}`).join('\n');
  await writeFile(path.join(repositoryRoot, 'THIRD_PARTY_NOTICES.md'), [
    '# Third-party notices',
    '',
    'orca-kit redistributes reviewed and modified snapshots from Matt Pocock\'s skills repository.',
    '',
    `Upstream repository: ${upstreamRepository}`,
    `Pinned commit: ${upstreamCommit}`,
    `Orca overlay version: ${overlayVersion}`,
    '',
    'Included paths:',
    '',
    inventory,
    '',
    'The bundled skills were modified for coordinator-supervised Orca orchestration.',
    'This project is not affiliated with, endorsed by, or an official product of Orca or its maintainers.',
    '',
    '## Matt Pocock skills license',
    '',
    license.trim(),
    '',
  ].join('\n'), 'utf8');
} finally {
  await rm(temporary, { recursive: true, force: true });
}

function parseSkill(content: string): { frontmatter: UpstreamFrontmatter; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/u.exec(content);
  if (match === null) throw new Error('Skill is missing YAML frontmatter.');
  return {
    frontmatter: parseYaml(match[1] ?? '') as UpstreamFrontmatter,
    body: match[2] ?? '',
  };
}

function adaptBody(body: string): string {
  let adapted = body;
  for (const name of Object.keys(skills)) {
    adapted = adapted.replace(new RegExp(`/${escapeRegExp(name)}(?![A-Za-z0-9-])`, 'gu'), name);
  }
  adapted = adapted.replaceAll('/setup-matt-pocock-skills', 'docs/agents/issue-tracker.md');
  adapted = adapted.replaceAll('setup-matt-pocock-skills', 'docs/agents/issue-tracker.md');
  adapted = adapted.replaceAll('tell the user to run `docs/agents/issue-tracker.md`', 'follow `docs/agents/issue-tracker.md`; if it is missing, report an incomplete orca-kit installation');
  adapted = adapted.replaceAll('If no tracker has been provided, default to the local-markdown tracker.', 'If the tracker document is missing, stop and report an incomplete orca-kit installation.');
  return adapted;
}

function renderOpenAiMetadata(name: string, description: string, disableModelInvocation: boolean): string {
  const shortDescription = description.length <= 90 ? description : `${description.slice(0, 87)}...`;
  return `# Generated by @dyewolf/orca-kit from pinned upstream metadata.\n${stringifyYaml({
    interface: {
      display_name: name.split('-').map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`).join(' '),
      short_description: shortDescription,
    },
    policy: { allow_implicit_invocation: !disableModelInvocation },
  })}`;
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
