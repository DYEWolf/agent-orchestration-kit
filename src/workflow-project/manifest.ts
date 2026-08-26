import { z } from 'zod';
import { isSafeRelativePath } from '../shared/path.js';

export const manifestEntrySchema = z.strictObject({
  path: z.string().min(1).refine(isSafeRelativePath, 'Manifest path must be a safe repository-relative POSIX path.'),
  hash: z.string().regex(/^[a-f0-9]{64}$/u),
  ownership: z.enum(['full', 'managed-block']),
});

export const manifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  cliVersion: z.string().min(1),
  bundleVersion: z.string().min(1),
  files: z.array(manifestEntrySchema),
}).superRefine((manifest, context) => {
  const seen = new Set<string>();
  for (const [index, entry] of manifest.files.entries()) {
    if (seen.has(entry.path)) {
      context.addIssue({
        code: 'custom',
        path: ['files', index, 'path'],
        message: `Duplicate manifest path: ${entry.path}`,
      });
    }
    seen.add(entry.path);
  }
});

export type Manifest = z.infer<typeof manifestSchema>;
export type ManifestEntry = z.infer<typeof manifestEntrySchema>;
