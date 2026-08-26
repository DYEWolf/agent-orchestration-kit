import type { ProfileName, WorkflowConfig } from './schema.js';

type Routing = WorkflowConfig['routing'];

export interface ProfileDefinition {
  readonly name: ProfileName;
  readonly stability: 'stable' | 'pending-live-validation';
  readonly requires: readonly ('codex' | 'claude')[];
  readonly routing: Routing;
}

const codexLunaHigh = {
  harness: 'codex',
  model: { value: 'gpt-5.6-luna', resolution: 'exact' },
  effort: 'high',
} as const;

const codexLunaXhigh = {
  harness: 'codex',
  model: { value: 'gpt-5.6-luna', resolution: 'exact' },
  effort: 'xhigh',
} as const;

const codexLunaMax = {
  harness: 'codex',
  model: { value: 'gpt-5.6-luna', resolution: 'exact' },
  effort: 'max',
} as const;

const codexTerraHigh = {
  harness: 'codex',
  model: { value: 'gpt-5.6-terra', resolution: 'exact' },
  effort: 'high',
} as const;

const codexSolHigh = {
  harness: 'codex',
  model: { value: 'gpt-5.6-sol', resolution: 'exact' },
  effort: 'high',
} as const;

const codexSolXhigh = {
  harness: 'codex',
  model: { value: 'gpt-5.6-sol', resolution: 'exact' },
  effort: 'xhigh',
} as const;

const claudeSonnet = {
  harness: 'claude',
  model: { value: 'sonnet', resolution: 'alias' },
} as const;

const claudeOpus = {
  harness: 'claude',
  model: { value: 'opus', resolution: 'alias' },
} as const;

export const profiles: Readonly<Record<ProfileName, ProfileDefinition>> = {
  'codex-only': {
    name: 'codex-only',
    stability: 'stable',
    requires: ['codex'],
    routing: {
      coordinator: codexSolHigh,
      explorer: codexLunaHigh,
      implementer: codexLunaXhigh,
      difficultImplementer: codexLunaMax,
      judgment: codexTerraHigh,
      architect: codexSolXhigh,
      reviewer: { ...codexSolHigh, freshSession: true },
    },
  },
  'claude-coordinator': {
    name: 'claude-coordinator',
    stability: 'stable',
    requires: ['codex', 'claude'],
    routing: {
      coordinator: claudeOpus,
      explorer: codexLunaHigh,
      implementer: codexLunaXhigh,
      difficultImplementer: codexLunaMax,
      judgment: codexTerraHigh,
      architect: claudeOpus,
      reviewer: { ...codexSolHigh, freshSession: true },
    },
  },
  'claude-only': {
    name: 'claude-only',
    stability: 'pending-live-validation',
    requires: ['claude'],
    routing: {
      coordinator: claudeOpus,
      explorer: claudeSonnet,
      implementer: claudeSonnet,
      difficultImplementer: claudeOpus,
      judgment: claudeOpus,
      architect: claudeOpus,
      reviewer: { ...claudeOpus, freshSession: true },
    },
  },
  'codex-coordinator': {
    name: 'codex-coordinator',
    stability: 'pending-live-validation',
    requires: ['codex', 'claude'],
    routing: {
      coordinator: codexSolHigh,
      explorer: claudeSonnet,
      implementer: claudeSonnet,
      difficultImplementer: claudeOpus,
      judgment: claudeOpus,
      architect: codexSolXhigh,
      reviewer: { ...claudeOpus, freshSession: true },
    },
  },
};

export function resolveConfig(profileName: ProfileName): WorkflowConfig {
  const profile = profiles[profileName];
  return {
    schemaVersion: 1,
    profile: profile.name,
    runtime: 'orca',
    language: 'en',
    tracker: { provider: 'github' },
    routing: profile.routing,
    execution: {
      maxImplementationWorkers: 3,
      reviewPolicy: 'risk-based',
      worktreePolicy: 'auto',
    },
    management: {
      globalMutations: 'confirm',
      githubMutations: 'confirm',
    },
  };
}
