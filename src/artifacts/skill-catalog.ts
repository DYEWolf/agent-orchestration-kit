export interface CatalogFileHash {
  readonly path: string;
  readonly hash: string;
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
    readonly overlayVersion: string;
    readonly renderedContentHash: string;
    readonly supportFiles: readonly CatalogFileHash[];
    readonly patch: Readonly<Record<string, unknown>>;
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
