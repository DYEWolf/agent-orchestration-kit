export const STANDARD_SKILL_NAMES = [
  'ask-matt',
  'grill-with-docs',
  'to-spec',
  'to-tickets',
  'implement',
  'wayfinder',
  'improve-codebase-architecture',
  'handoff',
  'grilling',
  'domain-modeling',
  'research',
  'prototype',
  'tdd',
  'diagnosing-bugs',
  'codebase-design',
  'code-review',
  'resolving-merge-conflicts',
] as const;

export type StandardSkillName = (typeof STANDARD_SKILL_NAMES)[number];

export interface SkillProvenance {
  readonly upstreamRepository: string;
  readonly upstreamPath: string;
  readonly upstreamCommit: string;
  readonly originalContentHash: string;
  readonly overlayVersion: string;
  readonly renderedContentHash: string;
}

export interface SkillSnapshot {
  readonly name: StandardSkillName;
  readonly upstreamBody: string;
  readonly orcaOverlay: string;
  readonly provenance: SkillProvenance;
}

export interface SkillSourceAdapter {
  list(): Promise<readonly StandardSkillName[]>;
  load(name: StandardSkillName): Promise<SkillSnapshot>;
}
