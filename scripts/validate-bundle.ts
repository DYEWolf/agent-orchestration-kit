import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import catalog from '../src/generated/skill-bundle.json' with { type: 'json' };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expectedNames = [
  'ask-matt', 'grill-with-docs', 'to-spec', 'to-tickets', 'implement', 'wayfinder',
  'improve-codebase-architecture', 'handoff', 'grilling', 'domain-modeling',
  'research', 'prototype', 'tdd', 'diagnosing-bugs', 'codebase-design',
  'code-review', 'resolving-merge-conflicts',
].sort();
const actualNames = catalog.skills.map((skill) => skill.name).sort();
if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
  throw new Error('Bundle skill vocabulary is incomplete or contains unrelated skills.');
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

for (const skill of catalog.skills) {
  const runtimeFiles: Readonly<Record<string, string>> = skill.files;
  const original = await readFile(path.join(root, 'templates/skills', skill.name, 'upstream/SKILL.md'), 'utf8');
  const rendered = await readFile(path.join(root, 'templates/skills', skill.name, 'rendered/SKILL.md'), 'utf8');
  if (sha256(original) !== skill.originalContentHash) throw new Error(`Original hash mismatch: ${skill.name}`);
  if (sha256(rendered) !== skill.renderedContentHash) throw new Error(`Rendered hash mismatch: ${skill.name}`);
  if (runtimeFiles['SKILL.md'] !== rendered) throw new Error(`Runtime catalog mismatch: ${skill.name}`);
  const upstreamDirectory = path.posix.dirname(skill.upstreamPath);
  for (const support of skill.supportFiles) {
    const prefix = `${upstreamDirectory}/`;
    if (!support.path.startsWith(prefix)) throw new Error(`Unsafe support path: ${support.path}`);
    const relativePath = support.path.slice(prefix.length);
    const content = await readFile(path.join(root, 'templates/skills', skill.name, 'upstream', relativePath), 'utf8');
    if (sha256(content) !== support.hash) throw new Error(`Support hash mismatch: ${support.path}`);
    if (runtimeFiles[relativePath] !== content) throw new Error(`Runtime support mismatch: ${support.path}`);
  }
}

const askMatt = catalog.skills.find((skill) => skill.name === 'ask-matt')?.files['SKILL.md'] ?? '';
for (const forbidden of ['grill-me', 'triage', 'setup-matt-pocock-skills', 'to-questionnaire', 'wizard', 'wait-what', 'teach', 'writing-for-agents']) {
  if (askMatt.includes(forbidden)) throw new Error(`ask-matt references uninstalled skill: ${forbidden}`);
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
