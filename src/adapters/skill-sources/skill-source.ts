export type SkillName = string;

export interface UpstreamSkillProvenance {
  readonly kind: 'upstream';
  readonly upstreamRepository: string;
  readonly upstreamPath: string;
  readonly upstreamCommit: string;
  readonly originalContentHash: string;
  readonly overlayVersion: string;
  readonly renderedContentHash: string;
}

export interface FirstPartySkillProvenance {
  readonly kind: 'first-party';
  readonly author: 'agent-orchestration-kit';
  readonly sourcePath: string;
  readonly sourceContentHash: string;
  readonly renderedContentHash: string;
}

export type SkillProvenance = UpstreamSkillProvenance | FirstPartySkillProvenance;

export interface SkillSnapshot {
  readonly name: SkillName;
  readonly upstreamBody: string;
  readonly orcaOverlay: string;
  readonly provenance: SkillProvenance;
}

export interface SkillSourceAdapter {
  list(): Promise<readonly SkillName[]>;
  load(name: SkillName): Promise<SkillSnapshot>;
}
