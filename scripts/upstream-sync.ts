import path from 'node:path';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execa } from 'execa';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  FIRST_PARTY_SKILL_REGISTRY,
  assertNoOriginCollisions,
  mergeCatalogSkills,
  type FirstPartyCatalogSkill,
  type UpstreamCatalogSkill,
} from '../src/artifacts/skill-catalog.js';

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

const temporary = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-upstream-sync-'));
try {
  await execa('git', ['clone', '--quiet', '--filter=blob:none', '--no-checkout', `${upstreamRepository}.git`, temporary]);
  await execa('git', ['-C', temporary, 'checkout', '--quiet', upstreamCommit]);
  const actualCommit = (await execa('git', ['-C', temporary, 'rev-parse', 'HEAD'])).stdout.trim();
  if (actualCommit !== upstreamCommit) throw new Error(`Expected ${upstreamCommit}, received ${actualCommit}`);

  const sharedOverlay = await readFile(path.join(repositoryRoot, 'templates/overlays/shared.md'), 'utf8');
  const askMattReplacement = await readFile(path.join(repositoryRoot, 'templates/patches/ask-matt-body.md'), 'utf8');
  const license = await readFile(path.join(temporary, 'LICENSE'), 'utf8');
  const catalogSkills: UpstreamCatalogSkill[] = [];
  const firstPartySkills = await readFirstPartySkills();
  assertNoOriginCollisions(Object.keys(skills), firstPartySkills.map((skill) => skill.name));

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
          replacements: [
            'adapter-specific slash invocations -> neutral skill names',
            'setup skill fallback -> installed GitHub tracker documentation',
            ...(name === 'wayfinder'
              ? ['Wayfinder label taxonomy -> body metadata and native tracker relationships']
              : []),
          ],
        };
    const patchedBody = name === 'ask-matt' ? askMattReplacement : adaptBody(parsed.body, name);
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

    const catalogSkill: UpstreamCatalogSkill = {
      name,
      files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
      origin: {
        kind: 'upstream',
        upstreamPath: `${upstreamDirectory}/SKILL.md`,
        originalContentHash: sha256(original),
        overlayVersion,
        renderedContentHash: sha256(rendered),
        supportFiles: supportFiles.sort((a, b) => a.path.localeCompare(b.path)),
        patch,
      },
    };
    catalogSkills.push(catalogSkill);
    await writeFile(path.join(snapshotRoot, 'provenance.json'), `${JSON.stringify({
      upstreamRepository,
      upstreamPath: catalogSkill.origin.upstreamPath,
      upstreamCommit,
      originalContentHash: catalogSkill.origin.originalContentHash,
      overlayVersion,
      renderedContentHash: catalogSkill.origin.renderedContentHash,
      supportFiles: catalogSkill.origin.supportFiles,
    }, null, 2)}\n`, 'utf8');
  }

  const catalog = {
    schemaVersion: 1,
    upstreamRepository,
    upstreamCommit,
    overlayVersion,
    license: { spdx: 'MIT', hash: sha256(license), content: license },
    skills: mergeCatalogSkills(catalogSkills, firstPartySkills),
  };
  await mkdir(path.join(repositoryRoot, 'src/generated'), { recursive: true });
  await writeFile(path.join(repositoryRoot, 'src/generated/skill-bundle.json'), `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  await writeFile(path.join(repositoryRoot, 'templates/skills/catalog.json'), `${JSON.stringify({
    ...catalog,
    skills: catalog.skills.map(({ files: _files, ...skill }) => skill),
  }, null, 2)}\n`, 'utf8');
  const inventory = catalogSkills
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((skill) => `- ${skill.name}: ${skill.origin.upstreamPath}`).join('\n');
  await writeFile(path.join(repositoryRoot, 'THIRD_PARTY_NOTICES.md'), [
    '# Third-party notices',
    '',
    'agent-orchestration-kit redistributes reviewed and modified snapshots from Matt Pocock\'s skills repository.',
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

function adaptBody(body: string, name: string): string {
  let adapted = body;
  for (const name of Object.keys(skills)) {
    adapted = adapted.replace(new RegExp(`/${escapeRegExp(name)}(?![A-Za-z0-9-])`, 'gu'), name);
  }
  adapted = adapted.replaceAll('/setup-matt-pocock-skills', 'docs/agents/issue-tracker.md');
  adapted = adapted.replaceAll('setup-matt-pocock-skills', 'docs/agents/issue-tracker.md');
  adapted = adapted.replaceAll('tell the user to run `docs/agents/issue-tracker.md`', 'follow `docs/agents/issue-tracker.md`; if it is missing, report an incomplete agent-orchestration-kit installation');
  adapted = adapted.replaceAll('If no tracker has been provided, default to the local-markdown tracker.', 'If the tracker document is missing, stop and report an incomplete agent-orchestration-kit installation.');
  if (name === 'wayfinder') adapted = adaptWayfinderBody(adapted);
  return adapted;
}

function adaptWayfinderBody(body: string): string {
  let adapted = body;
  adapted = replaceRequired(
    adapted,
    'The map is a single issue on this repo\'s issue tracker, labelled `wayfinder:map`, the canonical artifact. Its tickets are child issues of the map.',
    'The map is a single issue on this repo\'s issue tracker, identified by `Type: wayfinder-map` body metadata, and is the canonical artifact. Its tickets are child issues of the map. Do not create or require `wayfinder:*` labels.',
  );
  adapted = replaceRequired(
    adapted,
    '```markdown\n## Destination',
    '```markdown\nType: wayfinder-map\n\n## Destination',
  );
  adapted = replaceRequired(
    adapted,
    '```markdown\n## Question',
    '```markdown\nType: wayfinder-<research|prototype|grilling|task>\nPart of: #<map>\n\n## Question',
  );
  adapted = replaceRequired(
    adapted,
    'Each ticket carries a `wayfinder:<type>` label, one of `research`, `prototype`, `grilling`, `task` (see [Ticket Types](#ticket-types)).',
    'Each ticket carries stable body metadata: `Type: wayfinder-<research|prototype|grilling|task>` and `Part of: #<map>`. The native sub-issue relation is the canonical hierarchy when available; otherwise use a task list in the map as the fallback. `Type: wayfinder-task` is planning metadata and does not imply `ready-for-agent` or authorize an issue-owned execution Run.',
  );
  adapted = replaceRequired(
    adapted,
    'Only a tracker that lacks native blocking falls back to a body convention.',
    'Only a tracker that lacks native blocking falls back to a `Blocked by: #<issue>` body convention.',
  );
  adapted = replaceRequired(
    adapted,
    '3. **Create the map** (label `wayfinder:map`): Destination and Notes filled in, Decisions-so-far empty, the fog sketched into **Not yet specified**.',
    '3. **Create the map** with `Type: wayfinder-map` body metadata: Destination and Notes filled in, Decisions-so-far empty, the fog sketched into **Not yet specified**.',
  );
  return adapted;
}

function replaceRequired(content: string, source: string, replacement: string): string {
  if (!content.includes(source)) throw new Error(`Expected maintainer patch source was not found: ${source}`);
  return content.replace(source, replacement);
}

function renderOpenAiMetadata(name: string, description: string, disableModelInvocation: boolean): string {
  const shortDescription = description.length <= 90 ? description : `${description.slice(0, 87)}...`;
  return `# Generated by @dyewolf/agent-orchestration-kit from pinned upstream metadata.\n${stringifyYaml({
    interface: {
      display_name: name.split('-').map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`).join(' '),
      short_description: shortDescription,
    },
    policy: { allow_implicit_invocation: !disableModelInvocation },
  })}`;
}

async function readFirstPartySkills(): Promise<readonly FirstPartyCatalogSkill[]> {
  return Promise.all(FIRST_PARTY_SKILL_REGISTRY.map(async (definition) => {
    const sourceDirectory = path.join(repositoryRoot, definition.sourcePath);
    const files = await readTree(sourceDirectory);
    const skill = files['SKILL.md'];
    const metadata = files['agents/openai.yaml'];
    if (skill === undefined || metadata === undefined) {
      throw new Error(`First-party skill ${definition.name} must include SKILL.md and agents/openai.yaml.`);
    }
    return {
      name: definition.name,
      files,
      origin: {
        kind: 'first-party' as const,
        author: definition.author,
        sourcePath: definition.sourcePath,
        sourceContentHash: sha256(skill),
        renderedContentHash: sha256(skill),
        files: Object.entries(files)
          .map(([filePath, content]) => ({ path: filePath, hash: sha256(content) }))
          .sort((left, right) => left.path.localeCompare(right.path)),
      },
    } satisfies FirstPartyCatalogSkill;
  }));
}

async function readTree(directory: string, prefix = ''): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      Object.assign(files, await readTree(absolutePath, relativePath));
    } else if (entry.isFile()) {
      files[relativePath] = await readFile(absolutePath, 'utf8');
    } else {
      throw new Error(`First-party skill source contains unsupported entry: ${relativePath}`);
    }
  }
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
