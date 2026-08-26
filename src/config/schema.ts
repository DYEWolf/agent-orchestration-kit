import { z } from 'zod';

export const harnessSchema = z.enum(['codex', 'claude']);
export type Harness = z.infer<typeof harnessSchema>;

export const modelSchema = z.strictObject({
  value: z.string().min(1),
  resolution: z.enum(['exact', 'alias']),
});

export const routeSchema = z.strictObject({
  harness: harnessSchema,
  model: modelSchema,
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  freshSession: z.boolean().optional(),
});

export const profileNameSchema = z.enum([
  'codex-only',
  'claude-coordinator',
  'claude-only',
  'codex-coordinator',
]);
export type ProfileName = z.infer<typeof profileNameSchema>;

export const workflowConfigSchema = z.strictObject({
  schemaVersion: z.literal(1),
  profile: profileNameSchema,
  runtime: z.literal('orca'),
  language: z.literal('en'),
  tracker: z.strictObject({ provider: z.literal('github') }),
  routing: z.strictObject({
    coordinator: routeSchema,
    explorer: routeSchema,
    implementer: routeSchema,
    difficultImplementer: routeSchema,
    judgment: routeSchema,
    architect: routeSchema,
    reviewer: routeSchema,
  }),
  execution: z.strictObject({
    maxImplementationWorkers: z.number().int().min(1).max(16),
    reviewPolicy: z.literal('risk-based'),
    worktreePolicy: z.literal('auto'),
  }),
  management: z.strictObject({
    globalMutations: z.literal('confirm'),
    githubMutations: z.literal('confirm'),
  }),
});

export type WorkflowConfig = z.infer<typeof workflowConfigSchema>;
