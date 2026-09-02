import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  insertOrReplaceManagedBlock,
  inspectManagedBlock,
  MANAGED_BLOCK_END,
  MANAGED_BLOCK_START,
} from '../src/artifacts/managed-block.js';

const block = `${MANAGED_BLOCK_START}\nmanaged\n${MANAGED_BLOCK_END}`;

describe('managed AGENTS.md block', () => {
  it('preserves all pre-existing bytes when appending a first block', () => {
    fc.assert(
      fc.property(
        fc.string().filter((value) => !value.includes('<!-- agent-orchestration-kit:')),
        (source) => {
          const result = insertOrReplaceManagedBlock(source, block);
          expect(result.slice(0, source.length)).toBe(source);
          expect(inspectManagedBlock(result).content).toBe(block);
        },
      ),
    );
  });

  it('preserves bytes outside an existing managed block', () => {
    fc.assert(
      fc.property(
        fc.string().filter((value) => !value.includes('<!-- agent-orchestration-kit:')),
        fc.string().filter((value) => !value.includes('<!-- agent-orchestration-kit:')),
        (prefix, suffix) => {
          const original = `${prefix}${MANAGED_BLOCK_START}\nold\n${MANAGED_BLOCK_END}${suffix}`;
          const result = insertOrReplaceManagedBlock(original, block);
          expect(result).toBe(`${prefix}${block}${suffix}`);
        },
      ),
    );
  });

  it('rejects incomplete markers', () => {
    expect(inspectManagedBlock(`text\n${MANAGED_BLOCK_START}`).status).toBe('malformed');
    expect(() => insertOrReplaceManagedBlock(MANAGED_BLOCK_END, block)).toThrow(/malformed/u);
  });
});
