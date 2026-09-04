import { sha256 } from '../shared/hash.js';

export interface CatalogFileHash {
  readonly path: string;
  readonly hash: string;
}

export interface ManualReconciliation {
  readonly kind: 'manual';
  readonly overlayVersion: '2';
  readonly upstreamTreeHash: string;
  readonly renderedTreeHash: string;
  readonly upstreamFiles: readonly CatalogFileHash[];
  readonly renderedFiles: readonly CatalogFileHash[];
  readonly changes: readonly string[];
}

export interface SkillBundleCatalog {
  readonly schemaVersion: 1;
  readonly upstreamRepository: string;
  readonly upstreamCommit: string;
  readonly overlayVersion: '2';
  readonly license: {
    readonly spdx: 'MIT';
    readonly hash: string;
    readonly content: string;
  };
  readonly skills: readonly CatalogSkill[];
}

export interface FirstPartySkillDefinition {
  readonly name: string;
  readonly author: 'agent-orchestration-kit';
  readonly sourcePath: string;
}

/** The explicit registry of repository-owned skills included in the bundle. */
export const FIRST_PARTY_SKILL_REGISTRY = [
  {
    name: 'campaign',
    author: 'agent-orchestration-kit',
    sourcePath: 'templates/skills/campaign',
  },
] as const satisfies readonly FirstPartySkillDefinition[];

export interface UpstreamCatalogSkill {
  readonly name: string;
  readonly files: Readonly<Record<string, string>>;
  readonly origin: {
    readonly kind: 'upstream';
    readonly upstreamPath: string;
    readonly originalContentHash: string;
    readonly overlayVersion: '2';
    readonly renderedContentHash: string;
    readonly supportFiles: readonly CatalogFileHash[];
    readonly reconciliation: ManualReconciliation;
  };
}

export interface FirstPartyCatalogSkill {
  readonly name: string;
  readonly files: Readonly<Record<string, string>>;
  readonly origin: {
    readonly kind: 'first-party';
    readonly author: 'agent-orchestration-kit';
    readonly sourcePath: string;
    readonly sourceContentHash: string;
    readonly renderedContentHash: string;
    readonly files: readonly CatalogFileHash[];
  };
}

export type CatalogSkill = UpstreamCatalogSkill | FirstPartyCatalogSkill;

/** Hash a complete text-file tree by sorted path and content hash. */
export function hashFileTree(files: Readonly<Record<string, string>>): string {
  const entries = Object.entries(files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath, content]) => `${filePath}\0${sha256(content)}\0`)
    .join('');
  return sha256(entries);
}

/**
 * Reject an upstream sync before it can replace a first-party skill, then
 * return a deterministic catalog without mutating either input collection.
 */
export function mergeCatalogSkills(
  upstreamSkills: readonly UpstreamCatalogSkill[],
  firstPartySkills: readonly FirstPartyCatalogSkill[],
): CatalogSkill[] {
  assertNoOriginCollisions(
    upstreamSkills.map((skill) => skill.name),
    firstPartySkills.map((skill) => skill.name),
  );
  return [...upstreamSkills, ...firstPartySkills].sort((left, right) => left.name.localeCompare(right.name));
}

/** Reject an upstream sync before it can replace a first-party skill. */
export function assertNoOriginCollisions(
  upstreamNames: Iterable<string>,
  firstPartyNames: Iterable<string>,
): void {
  const upstream = new Set(upstreamNames);
  for (const name of firstPartyNames) {
    if (upstream.has(name)) throw new Error(`Upstream skill collides with first-party skill: ${name}`);
  }
}
