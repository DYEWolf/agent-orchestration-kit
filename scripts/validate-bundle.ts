import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import catalog from '../src/generated/skill-bundle.json' with { type: 'json' };
import { FIRST_PARTY_SKILL_REGISTRY } from '../src/artifacts/skill-catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const actualNames = catalog.skills.map((skill) => skill.name).sort();
if (new Set(actualNames).size !== actualNames.length || actualNames.length === 0) {
  throw new Error('Bundle skill names must be non-empty and unique.');
}

if (sha256(catalog.license.content) !== catalog.license.hash) {
  throw new Error('Bundled upstream license hash mismatch.');
}

const maintenanceCatalog = JSON.parse(
  await readFile(path.join(root, 'templates/skills/catalog.json'), 'utf8'),
) as typeof catalog;
if (maintenanceCatalog.upstreamCommit !== catalog.upstreamCommit
  || maintenanceCatalog.overlayVersion !== catalog.overlayVersion) {
  throw new Error('Runtime and maintenance catalogs disagree about bundle identity.');
}
if (JSON.stringify(maintenanceCatalog.skills.map((skill) => ({ name: skill.name, origin: skill.origin })).sort(byName))
  !== JSON.stringify(catalog.skills.map((skill) => ({ name: skill.name, origin: skill.origin })).sort(byName))) {
  throw new Error('Runtime and maintenance catalogs disagree about skill origin evidence.');
}

const firstPartyNames = new Set<string>(FIRST_PARTY_SKILL_REGISTRY.map((skill) => skill.name));
for (const definition of FIRST_PARTY_SKILL_REGISTRY) {
  const skill = catalog.skills.find((candidate) => candidate.name === definition.name);
  if (skill?.origin.kind !== 'first-party' || skill.origin.author !== definition.author
    || skill.origin.sourcePath !== definition.sourcePath) {
    throw new Error(`Registered first-party skill is missing or has incorrect provenance: ${definition.name}`);
  }
}
for (const skill of catalog.skills) {
  if (skill.origin.kind === 'first-party' && !firstPartyNames.has(skill.name)) {
    throw new Error(`Catalog contains an unregistered first-party skill: ${skill.name}`);
  }
}

for (const skill of catalog.skills) {
  const runtimeFiles: Readonly<Record<string, string>> = skill.files;
  if (skill.origin.kind === 'upstream') {
    const original = await readFile(path.join(root, 'templates/skills', skill.name, 'upstream/SKILL.md'), 'utf8');
    const rendered = await readFile(path.join(root, 'templates/skills', skill.name, 'rendered/SKILL.md'), 'utf8');
    if (sha256(original) !== skill.origin.originalContentHash) throw new Error(`Original hash mismatch: ${skill.name}`);
    if (sha256(rendered) !== skill.origin.renderedContentHash) throw new Error(`Rendered hash mismatch: ${skill.name}`);
    if (runtimeFiles['SKILL.md'] !== rendered) throw new Error(`Runtime catalog mismatch: ${skill.name}`);
    const upstreamDirectory = path.posix.dirname(skill.origin.upstreamPath);
    for (const support of skill.origin.supportFiles) {
      const prefix = `${upstreamDirectory}/`;
      if (!support.path.startsWith(prefix)) throw new Error(`Unsafe support path: ${support.path}`);
      const relativePath = support.path.slice(prefix.length);
      const content = await readFile(path.join(root, 'templates/skills', skill.name, 'upstream', relativePath), 'utf8');
      if (sha256(content) !== support.hash) throw new Error(`Support hash mismatch: ${support.path}`);
      if (runtimeFiles[relativePath] !== content) throw new Error(`Runtime support mismatch: ${support.path}`);
    }
  } else {
    const sourcePath = skill.origin.sourcePath;
    if (sourcePath === undefined) throw new Error(`First-party source path is missing: ${skill.name}`);
    const sourceDirectory = path.join(root, sourcePath);
    const sourceFiles = skill.origin.files;
    const sourceFilePaths = sourceFiles.map((file) => file.path);
    const sortedSourceFilePaths = [...sourceFilePaths].sort((left, right) => left.localeCompare(right));
    if (new Set(sourceFilePaths).size !== sourceFilePaths.length
      || JSON.stringify(sourceFilePaths) !== JSON.stringify(sortedSourceFilePaths)) {
      throw new Error(`First-party provenance paths must be unique and sorted: ${skill.name}`);
    }
    const runtimeFilePaths = Object.keys(runtimeFiles).sort((left, right) => left.localeCompare(right));
    if (JSON.stringify(sourceFilePaths) !== JSON.stringify(runtimeFilePaths)) {
      throw new Error(`First-party runtime file set mismatch: ${skill.name}`);
    }
    const source = await readFile(path.join(sourceDirectory, 'SKILL.md'), 'utf8');
    if (sha256(source) !== skill.origin.sourceContentHash) throw new Error(`First-party source hash mismatch: ${skill.name}`);
    if (sha256(runtimeFiles['SKILL.md'] ?? '') !== skill.origin.renderedContentHash) throw new Error(`First-party rendered hash mismatch: ${skill.name}`);
    if (runtimeFiles['SKILL.md'] !== source) throw new Error(`First-party runtime catalog mismatch: ${skill.name}`);
    for (const sourceFile of sourceFiles) {
      if (!isSafeRelativePath(sourceFile.path)) throw new Error(`Unsafe first-party source path: ${sourceFile.path}`);
      const content = await readFile(path.join(sourceDirectory, sourceFile.path), 'utf8');
      if (sha256(content) !== sourceFile.hash) throw new Error(`First-party source hash mismatch: ${skill.name}/${sourceFile.path}`);
      if (runtimeFiles[sourceFile.path] !== content) throw new Error(`First-party source file mismatch: ${skill.name}/${sourceFile.path}`);
    }
  }
}

const askMatt = catalog.skills.find((skill) => skill.name === 'ask-matt')?.files['SKILL.md'] ?? '';
for (const forbidden of ['grill-me', 'triage', 'setup-matt-pocock-skills', 'to-questionnaire', 'wizard', 'wait-what', 'teach', 'writing-for-agents']) {
  if (askMatt.includes(forbidden)) throw new Error(`ask-matt references uninstalled skill: ${forbidden}`);
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function byName(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name);
}

function isSafeRelativePath(value: string): boolean {
  return value.length > 0
    && !path.posix.isAbsolute(value)
    && path.posix.normalize(value) === value
    && value !== '..'
    && !value.startsWith('../');
}
