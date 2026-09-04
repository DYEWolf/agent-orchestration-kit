import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';
import { renderSkillNotices, renderSkillProvenance, skillBundleCatalog as catalog } from '../src/artifacts/skill-bundle.js';
import { assertNoOriginCollisions, hashFileTree, FIRST_PARTY_SKILL_REGISTRY } from '../src/artifacts/skill-catalog.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upstreamRepository = 'https://github.com/mattpocock/skills';
const upstreamCommit = '6654f6b60cd9d5be8b54c6fafe44346dabeb3b76';
const overlayVersion = '2';

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

const temporary = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-upstream-sync-'));
try {
  await execa('git', ['clone', '--quiet', '--filter=blob:none', '--no-checkout', `${upstreamRepository}.git`, temporary]);
  await execa('git', ['-C', temporary, 'checkout', '--quiet', upstreamCommit]);
  const actualCommit = (await execa('git', ['-C', temporary, 'rev-parse', 'HEAD'])).stdout.trim();
  if (actualCommit !== upstreamCommit) throw new Error(`Expected ${upstreamCommit}, received ${actualCommit}`);

  assertCatalogIdentity();
  const license = await readFile(path.join(temporary, 'LICENSE'), 'utf8');
  if (catalog.license.spdx !== 'MIT' || sha256(license) !== catalog.license.hash || catalog.license.content !== license) {
    throw new Error('Catalog does not contain the complete pinned upstream MIT license.');
  }

  for (const [name, upstreamPath] of Object.entries(skills)) {
    await validateUpstreamSkill(name, upstreamPath, temporary);
  }
  await validateFirstPartyCampaign();
  await validateCatalogAndNotices(license);
  console.log(`Upstream sync validation PASS: ${Object.keys(skills).length} pinned upstream skills, Campaign, catalogs, notices, and provenance agree.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}

async function validateUpstreamSkill(name: string, upstreamPath: string, cloneRoot: string): Promise<void> {
  const skill = catalog.skills.find((candidate) => candidate.name === name);
  if (skill?.origin.kind !== 'upstream') throw new Error(`Catalog is missing upstream skill ${name}.`);

  const upstreamFiles = await readTree(path.join(cloneRoot, upstreamPath));
  const snapshotFiles = await readTree(path.join(repositoryRoot, 'templates/skills', name, 'upstream'));
  assertTreeEqual(snapshotFiles, upstreamFiles, `${name} upstream snapshot`);

  const renderedFiles = await readTree(path.join(repositoryRoot, 'templates/skills', name, 'rendered'));
  const localFiles = await readTree(path.join(repositoryRoot, '.agents/skills', name), 'PROVENANCE.json');
  assertTreeEqual(renderedFiles, localFiles, `${name} rendered Living Fixture`);
  assertTreeEqual(skill.files, renderedFiles, `${name} runtime catalog`);

  const upstreamHashes = hashFiles(upstreamFiles);
  const renderedHashes = hashFiles(renderedFiles);
  const reconciliation = skill.origin.reconciliation;
  if (reconciliation.kind !== 'manual' || reconciliation.overlayVersion !== overlayVersion) {
    throw new Error(`${name} must use overlay-v2 manual reconciliation.`);
  }
  assertHashesEqual(reconciliation.upstreamFiles, upstreamHashes, `${name} upstream per-file hashes`);
  assertHashesEqual(reconciliation.renderedFiles, renderedHashes, `${name} rendered per-file hashes`);
  if (reconciliation.upstreamTreeHash !== hashFileTree(upstreamFiles)) throw new Error(`${name} upstream tree hash mismatch.`);
  if (reconciliation.renderedTreeHash !== hashFileTree(renderedFiles)) throw new Error(`${name} rendered tree hash mismatch.`);
  if (reconciliation.changes.length === 0) throw new Error(`${name} reconciliation must explain its reviewed changes.`);
  if (skill.origin.originalContentHash !== sha256(upstreamFiles['SKILL.md'] ?? '')) throw new Error(`${name} original content hash mismatch.`);
  if (skill.origin.renderedContentHash !== sha256(renderedFiles['SKILL.md'] ?? '')) throw new Error(`${name} rendered content hash mismatch.`);

  const reconciliationPath = path.join(repositoryRoot, 'templates/skills', name, 'reconciliation.json');
  const recorded = JSON.parse(await readFile(reconciliationPath, 'utf8')) as unknown;
  if (JSON.stringify(recorded) !== JSON.stringify(reconciliation)) throw new Error(`${name} reconciliation record disagrees with the runtime catalog.`);

  const expectedProvenance = renderSkillProvenance(skill);
  const actualProvenance = await readFile(path.join(repositoryRoot, '.agents/skills', name, 'PROVENANCE.json'), 'utf8');
  const templateProvenance = await readFile(path.join(repositoryRoot, 'templates/skills', name, 'provenance.json'), 'utf8');
  if (actualProvenance !== expectedProvenance || templateProvenance !== expectedProvenance) {
    throw new Error(`${name} repository-local provenance is not generated deterministically.`);
  }
}

async function validateFirstPartyCampaign(): Promise<void> {
  const definition = FIRST_PARTY_SKILL_REGISTRY.find((candidate) => candidate.name === 'campaign');
  if (definition === undefined) throw new Error('Campaign is not registered as first-party.');
  const sourceFiles = await readTree(path.join(repositoryRoot, definition.sourcePath));
  const localFiles = await readTree(path.join(repositoryRoot, '.agents/skills/campaign'), 'PROVENANCE.json');
  assertTreeEqual(sourceFiles, localFiles, 'Campaign first-party source and local Living Fixture');

  const skill = catalog.skills.find((candidate) => candidate.name === 'campaign');
  if (skill?.origin.kind !== 'first-party') throw new Error('Campaign must have first-party provenance.');
  assertTreeEqual(skill.files, sourceFiles, 'Campaign runtime catalog');
  const expectedProvenance = renderSkillProvenance(skill);
  const actualProvenance = await readFile(path.join(repositoryRoot, '.agents/skills/campaign/PROVENANCE.json'), 'utf8');
  if (actualProvenance !== expectedProvenance) throw new Error('Campaign provenance is not generated deterministically.');
}

async function validateCatalogAndNotices(license: string): Promise<void> {
  const maintenance = JSON.parse(await readFile(path.join(repositoryRoot, 'templates/skills/catalog.json'), 'utf8')) as typeof catalog;
  if (catalog.schemaVersion !== 1 || maintenance.schemaVersion !== 1
    || catalog.upstreamRepository !== upstreamRepository || maintenance.upstreamRepository !== upstreamRepository
    || catalog.upstreamCommit !== upstreamCommit || maintenance.upstreamCommit !== upstreamCommit
    || catalog.overlayVersion !== overlayVersion || maintenance.overlayVersion !== overlayVersion) {
    throw new Error('Runtime and maintenance catalogs disagree about the pinned overlay-v2 bundle identity.');
  }
  if (catalog.license.content !== license || maintenance.license.content !== license
    || catalog.license.hash !== maintenance.license.hash) throw new Error('Runtime and maintenance catalogs disagree about the license.');
  const runtimeOrigins = catalog.skills.map(({ name, origin }) => ({ name, origin })).sort(byName);
  const maintenanceOrigins = maintenance.skills.map(({ name, origin }) => ({ name, origin })).sort(byName);
  if (JSON.stringify(runtimeOrigins) !== JSON.stringify(maintenanceOrigins)) throw new Error('Runtime and maintenance catalogs disagree about origin evidence.');

  const publicNotice = await readFile(path.join(repositoryRoot, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  const installedNotice = await readFile(path.join(repositoryRoot, '.agents/THIRD_PARTY_NOTICES.md'), 'utf8');
  const expectedNotice = renderSkillNotices();
  const expectedInstalledNotice = `<!-- Generated by @dyewolf/agent-orchestration-kit. V1 does not update this file automatically. -->\n\n${expectedNotice}`;
  if (publicNotice !== expectedNotice || installedNotice !== expectedInstalledNotice) {
    throw new Error('Third-party notices do not match the catalog-derived notice generator.');
  }
}

function assertCatalogIdentity(): void {
  if (catalog.upstreamRepository !== upstreamRepository || catalog.upstreamCommit !== upstreamCommit || catalog.overlayVersion !== overlayVersion) {
    throw new Error('Bundle catalog does not use the pinned overlay-v2 identity.');
  }
  if (catalog.skills.length !== Object.keys(skills).length + FIRST_PARTY_SKILL_REGISTRY.length) {
    throw new Error('Bundle catalog skill inventory is incomplete.');
  }
  const names = catalog.skills.map((skill) => skill.name);
  if (new Set(names).size !== names.length || JSON.stringify(names) !== JSON.stringify([...names].sort(byNameString))) {
    throw new Error('Bundle catalog skill names must be unique and sorted.');
  }
  assertNoOriginCollisions(
    catalog.skills.filter((skill) => skill.origin.kind === 'upstream').map((skill) => skill.name),
    FIRST_PARTY_SKILL_REGISTRY.map((skill) => skill.name),
  );
  if (catalog.skills.some((skill) => skill.origin.kind === 'upstream' && skill.origin.reconciliation.kind !== 'manual')) {
    throw new Error('Every upstream origin must carry a manual reconciliation.');
  }
}

function hashFiles(files: Readonly<Record<string, string>>): readonly { path: string; hash: string }[] {
  return Object.entries(files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath, content]) => ({ path: filePath, hash: sha256(content) }));
}

function assertHashesEqual(
  actual: readonly { path: string; hash: string }[],
  expected: readonly { path: string; hash: string }[],
  label: string,
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} mismatch.`);
}

function assertTreeEqual(
  actual: Readonly<Record<string, string>>,
  expected: Readonly<Record<string, string>>,
  label: string,
): void {
  const actualPaths = Object.keys(actual).sort((left, right) => left.localeCompare(right));
  const expectedPaths = Object.keys(expected).sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) throw new Error(`${label} file set mismatch.`);
  for (const filePath of expectedPaths) {
    if (actual[filePath] !== expected[filePath]) throw new Error(`${label} differs at ${filePath}.`);
  }
}

async function readTree(directory: string, excluded?: string, prefix = ''): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(files, await readTree(absolutePath, excluded, relativePath));
    else if (entry.isFile() && relativePath !== excluded) files[relativePath] = await readFile(absolutePath, 'utf8');
    else if (!entry.isFile()) throw new Error(`Unsupported skill tree entry: ${relativePath}`);
  }
  return Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right)));
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function byName(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name);
}

function byNameString(left: string, right: string): number {
  return left.localeCompare(right);
}
