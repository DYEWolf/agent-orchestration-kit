export const MANAGED_BLOCK_START = '<!-- agent-orchestration-kit:start version="1" -->';
export const MANAGED_BLOCK_END = '<!-- agent-orchestration-kit:end -->';

export interface ManagedBlockResult {
  readonly status: 'absent' | 'valid' | 'malformed';
  readonly content?: string;
  readonly start?: number;
  readonly end?: number;
}

export function inspectManagedBlock(source: string): ManagedBlockResult {
  const starts = indexesOf(source, MANAGED_BLOCK_START);
  const ends = indexesOf(source, MANAGED_BLOCK_END);
  if (starts.length === 0 && ends.length === 0) return { status: 'absent' };
  if (starts.length !== 1 || ends.length !== 1) return { status: 'malformed' };

  const start = starts[0];
  const endMarkerStart = ends[0];
  if (start === undefined || endMarkerStart === undefined || endMarkerStart < start) {
    return { status: 'malformed' };
  }
  const end = endMarkerStart + MANAGED_BLOCK_END.length;
  return { status: 'valid', content: source.slice(start, end), start, end };
}

export function insertOrReplaceManagedBlock(source: string, block: string): string {
  const inspected = inspectManagedBlock(source);
  if (inspected.status === 'malformed') {
    throw new Error('AGENTS.md contains malformed agent-orchestration-kit managed markers.');
  }
  if (inspected.status === 'valid') {
    return `${source.slice(0, inspected.start)}${block}${source.slice(inspected.end)}`;
  }
  if (source.length === 0) return `${block}\n`;
  const separator = source.endsWith('\n\n') ? '' : source.endsWith('\n') ? '\n' : '\n\n';
  return `${source}${separator}${block}\n`;
}

function indexesOf(source: string, search: string): number[] {
  const indexes: number[] = [];
  let offset = 0;
  while (offset <= source.length) {
    const index = source.indexOf(search, offset);
    if (index === -1) break;
    indexes.push(index);
    offset = index + search.length;
  }
  return indexes;
}
