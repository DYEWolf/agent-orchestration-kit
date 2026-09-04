import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSkillNotices, renderSkillProvenance, skillBundleCatalog as catalog } from '../src/artifacts/skill-bundle.js';
import {
  assertNoOriginCollisions,
  FIRST_PARTY_SKILL_REGISTRY,
  hashFileTree,
  type CatalogFileHash,
} from '../src/artifacts/skill-catalog.js';
import { sha256 } from '../src/shared/hash.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const maintenanceCatalog = JSON.parse(
  await readFile(path.join(root, 'templates/skills/catalog.json'), 'utf8'),
) as {
  readonly schemaVersion: number;
  readonly upstreamRepository: string;
  readonly upstreamCommit: string;
  readonly overlayVersion: string;
  readonly license: { readonly spdx: string; readonly hash: string; readonly content: string };
  readonly skills: readonly { readonly name: string; readonly origin: unknown }[];
};

const actualNames = catalog.skills.map((skill) => skill.name);
const sortedNames = [...actualNames].sort(compare);
if (new Set(actualNames).size !== actualNames.length || actualNames.length === 0
  || JSON.stringify(actualNames) !== JSON.stringify(sortedNames)) {
  throw new Error('Bundle skill names must be non-empty, unique, and sorted.');
}
if (maintenanceCatalog.schemaVersion !== catalog.schemaVersion
  || maintenanceCatalog.upstreamRepository !== catalog.upstreamRepository
  || maintenanceCatalog.upstreamCommit !== catalog.upstreamCommit
  || maintenanceCatalog.overlayVersion !== catalog.overlayVersion
  || maintenanceCatalog.license.spdx !== catalog.license.spdx
  || maintenanceCatalog.license.hash !== catalog.license.hash
  || maintenanceCatalog.license.content !== catalog.license.content) {
  throw new Error('Runtime and maintenance catalogs disagree about bundle identity or license.');
}
if (JSON.stringify(maintenanceCatalog.skills.map(({ name, origin }) => ({ name, origin })))
  !== JSON.stringify(catalog.skills.map(({ name, origin }) => ({ name, origin })))) {
  throw new Error('Runtime and maintenance catalogs disagree about skill origin evidence.');
}
if (sha256(catalog.license.content) !== catalog.license.hash) {
  throw new Error('Bundled upstream license hash mismatch.');
}

const firstPartyNames: readonly string[] = FIRST_PARTY_SKILL_REGISTRY.map((skill) => skill.name);
assertNoOriginCollisions(
  catalog.skills.filter((skill) => skill.origin.kind === 'upstream').map((skill) => skill.name),
  firstPartyNames,
);
for (const definition of FIRST_PARTY_SKILL_REGISTRY) {
  const skill = catalog.skills.find((candidate) => candidate.name === definition.name);
  if (skill?.origin.kind !== 'first-party' || skill.origin.author !== definition.author
    || skill.origin.sourcePath !== definition.sourcePath) {
    throw new Error(`Registered first-party skill is missing or has incorrect provenance: ${definition.name}`);
  }
}
for (const skill of catalog.skills) {
  if (skill.origin.kind === 'first-party' && !firstPartyNames.includes(skill.name)) {
    throw new Error(`Catalog contains an unregistered first-party skill: ${skill.name}`);
  }
}

for (const obsolete of ['templates/overlays/shared.md', 'templates/patches/ask-matt-body.md']) {
  if (await exists(path.join(root, obsolete))) throw new Error(`Obsolete overlay artifact remains: ${obsolete}`);
}

for (const skill of catalog.skills) {
  const runtimeFiles = skill.files;
  assertSortedPaths(Object.keys(runtimeFiles), `${skill.name} runtime catalog`);
  const localFiles = await readTree(path.join(root, '.agents/skills', skill.name), 'PROVENANCE.json');
  const actualProvenance = await readFile(path.join(root, '.agents/skills', skill.name, 'PROVENANCE.json'), 'utf8');
  const expectedProvenance = renderSkillProvenance(skill);
  if (actualProvenance !== expectedProvenance) {
    throw new Error(`Repository-local provenance is not generated deterministically: ${skill.name}`);
  }

  if (skill.origin.kind === 'upstream') {
    for (const obsolete of ['overlay.md', 'patch.json']) {
      if (await exists(path.join(root, 'templates/skills', skill.name, obsolete))) {
        throw new Error(`Obsolete executable overlay artifact remains: templates/skills/${skill.name}/${obsolete}`);
      }
    }

    const upstreamFiles = await readTree(path.join(root, 'templates/skills', skill.name, 'upstream'));
    const renderedFiles = await readTree(path.join(root, 'templates/skills', skill.name, 'rendered'));
    assertTreeEqual(renderedFiles, localFiles, `${skill.name} rendered/local Living Fixture`);
    assertTreeEqual(renderedFiles, runtimeFiles, `${skill.name} runtime catalog`);

    const reconciliationPath = path.join(root, 'templates/skills', skill.name, 'reconciliation.json');
    const recordedReconciliation = JSON.parse(await readFile(reconciliationPath, 'utf8')) as unknown;
    if (JSON.stringify(recordedReconciliation) !== JSON.stringify(skill.origin.reconciliation)) {
      throw new Error(`Reconciliation record disagrees with the runtime catalog: ${skill.name}`);
    }
    const upstreamHashes = hashFiles(upstreamFiles);
    const renderedHashes = hashFiles(renderedFiles);
    assertHashesEqual(skill.origin.reconciliation.upstreamFiles, upstreamHashes, `${skill.name} upstream hashes`);
    assertHashesEqual(skill.origin.reconciliation.renderedFiles, renderedHashes, `${skill.name} rendered hashes`);
    if (skill.origin.reconciliation.upstreamTreeHash !== hashFileTree(upstreamFiles)
      || skill.origin.reconciliation.renderedTreeHash !== hashFileTree(renderedFiles)) {
      throw new Error(`Reconciliation tree hash mismatch: ${skill.name}`);
    }
    if (sha256(upstreamFiles['SKILL.md'] ?? '') !== skill.origin.originalContentHash
      || sha256(renderedFiles['SKILL.md'] ?? '') !== skill.origin.renderedContentHash) {
      throw new Error(`Skill body hash mismatch: ${skill.name}`);
    }

    const upstreamDirectory = path.posix.dirname(skill.origin.upstreamPath);
    const expectedSupport = hashFiles(upstreamFiles)
      .filter((file) => file.path !== 'SKILL.md')
      .map((file) => ({ path: `${upstreamDirectory}/${file.path}`, hash: file.hash }));
    assertHashesEqual(skill.origin.supportFiles, expectedSupport, `${skill.name} support hashes`);
    for (const support of skill.origin.supportFiles) {
      const prefix = `${upstreamDirectory}/`;
      if (!support.path.startsWith(prefix)) throw new Error(`Unsafe support path: ${support.path}`);
      const relativePath = support.path.slice(prefix.length);
      if (runtimeFiles[relativePath] !== renderedFiles[relativePath]) {
        throw new Error(`Runtime support mismatch: ${skill.name}/${relativePath}`);
      }
    }
    const templateProvenance = await readFile(path.join(root, 'templates/skills', skill.name, 'provenance.json'), 'utf8');
    if (templateProvenance !== expectedProvenance) {
      throw new Error(`Template provenance is not generated deterministically: ${skill.name}`);
    }
  } else {
    if (await exists(path.join(root, 'templates/skills', skill.name, 'reconciliation.json'))) {
      throw new Error(`First-party skill must not have an upstream reconciliation: ${skill.name}`);
    }
    const sourceFiles = await readTree(path.join(root, skill.origin.sourcePath));
    assertTreeEqual(sourceFiles, localFiles, `${skill.name} source/local Living Fixture`);
    assertTreeEqual(sourceFiles, runtimeFiles, `${skill.name} runtime catalog`);
    const sourceHashes = hashFiles(sourceFiles);
    assertHashesEqual(skill.origin.files, sourceHashes, `${skill.name} source hashes`);
    if (sha256(sourceFiles['SKILL.md'] ?? '') !== skill.origin.sourceContentHash
      || sha256(sourceFiles['SKILL.md'] ?? '') !== skill.origin.renderedContentHash) {
      throw new Error(`First-party body hash mismatch: ${skill.name}`);
    }
  }
}

const askMatt = catalog.skills.find((skill) => skill.name === 'ask-matt');
if (askMatt?.origin.kind !== 'upstream') throw new Error('ask-matt is missing from upstream provenance.');
for (const forbidden of ['grill-me', 'triage', 'setup-matt-pocock-skills', 'to-questionnaire', 'wizard', 'wait-what', 'teach', 'writing-for-agents']) {
  if (askMatt.files['SKILL.md']?.includes(forbidden)) throw new Error(`ask-matt references uninstalled skill: ${forbidden}`);
}

const expectedNotice = renderSkillNotices();
const rootNotice = await readFile(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
const installedNotice = await readFile(path.join(root, '.agents/THIRD_PARTY_NOTICES.md'), 'utf8');
const expectedInstalledNotice = `<!-- Generated by @dyewolf/agent-orchestration-kit. V1 does not update this file automatically. -->\n\n${expectedNotice}`;
if (rootNotice !== expectedNotice || installedNotice !== expectedInstalledNotice) {
  throw new Error('Third-party notices do not match the catalog-derived notice generator.');
}

console.log(`Bundle validation PASS: ${catalog.skills.length} complete skill trees, overlay-v2 evidence, provenance, Campaign, catalogs, and notices agree.`);

async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(() => true, () => false);
}

async function readTree(directory: string, excluded?: string, prefix = ''): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => compare(left.name, right.name))) {
    const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      Object.assign(files, await readTree(absolutePath, excluded, relativePath));
    } else if (entry.isFile() && relativePath !== excluded) {
      files[relativePath] = await readFile(absolutePath, 'utf8');
    } else if (!entry.isFile()) {
      throw new Error(`Unsupported skill tree entry: ${relativePath}`);
    }
  }
  return Object.fromEntries(Object.entries(files).sort(([left], [right]) => compare(left, right)));
}

function hashFiles(files: Readonly<Record<string, string>>): readonly CatalogFileHash[] {
  return Object.entries(files)
    .sort(([left], [right]) => compare(left, right))
    .map(([filePath, content]) => ({ path: filePath, hash: sha256(content) }));
}

function assertHashesEqual(
  actual: readonly CatalogFileHash[],
  expected: readonly CatalogFileHash[],
  label: string,
): void {
  assertSortedPaths(actual.map((file) => file.path), label);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} mismatch.`);
}

function assertSortedPaths(paths: readonly string[], label: string): void {
  const sorted = [...paths].sort(compare);
  if (new Set(paths).size !== paths.length || JSON.stringify(paths) !== JSON.stringify(sorted)) {
    throw new Error(`${label} paths must be sorted and unique.`);
  }
}

function assertTreeEqual(
  actual: Readonly<Record<string, string>>,
  expected: Readonly<Record<string, string>>,
  label: string,
): void {
  const actualPaths = Object.keys(actual).sort(compare);
  const expectedPaths = Object.keys(expected).sort(compare);
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) throw new Error(`${label} file set mismatch.`);
  for (const filePath of expectedPaths) {
    if (actual[filePath] !== expected[filePath]) throw new Error(`${label} differs at ${filePath}.`);
  }
}

function compare(left: string, right: string): number {
  return left.localeCompare(right);
}
