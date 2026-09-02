import { readdir, readFile, readlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonicalIdentity = 'agent-orchestration-kit';
const legacyIdentities = [
  ['orca', '-', 'kit'].join(''),
  ['orca', '-', 'workflow'].join(''),
  ['orka', '-', 'kit'].join(''),
] as const;
const legacyPattern = new RegExp(legacyIdentities.map(escapeRegExp).join('|'), 'giu');
const historicalResearchPath = ['docs', 'research', `${legacyIdentities[0]}-name-risk.md`].join('/');
const allowedFullTextPaths = new Set([
  'docs/adr/0001-use-generic-product-identity.md',
  historicalResearchPath,
]);

type MatchSource = 'path' | 'target' | 'content';

export interface ResidualMatch {
  readonly path: string;
  readonly line: number;
  readonly column: number;
  readonly value: string;
  readonly source: MatchSource;
  readonly reason: 'historical-record' | 'superseded-decision' | 'unallowlisted';
}

export interface ValidationResult {
  readonly allowed: readonly ResidualMatch[];
  readonly violations: readonly ResidualMatch[];
}

export interface ValidationOutput {
  readonly exitCode: 0 | 1;
  readonly stdout: string;
  readonly stderr: string;
}

interface FileEntry {
  readonly relativePath: string;
  readonly symbolicLink: boolean;
}

export async function validateIdentity(root: string): Promise<ValidationResult> {
  const allowed: ResidualMatch[] = [];
  const violations: ResidualMatch[] = [];

  for (const entry of await listFiles(root)) {
    for (const match of findMatches(entry.relativePath, 'path')) {
      classify(entry.relativePath, match, entry.symbolicLink, '', allowed, violations);
    }

    const absolutePath = path.join(root, entry.relativePath);
    if (entry.symbolicLink) {
      const target = await readlink(absolutePath, 'utf8');
      for (const [index, line] of target.split(/\r?\n/u).entries()) {
        for (const match of findMatches(line, 'target')) {
          classify(entry.relativePath, {
            ...match,
            line: index + 1,
          }, true, line, allowed, violations);
        }
      }
      continue;
    }

    const content = await readFile(absolutePath, 'utf8');
    for (const [index, line] of content.split(/\r?\n/u).entries()) {
      for (const match of findMatches(line, 'content')) {
        classify(entry.relativePath, {
          ...match,
          line: index + 1,
        }, false, line, allowed, violations);
      }
    }
  }

  return { allowed, violations };
}

export function formatValidationResult(result: ValidationResult): ValidationOutput {
  if (result.violations.length > 0) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: [
        `Identity validation FAIL: ${result.violations.length} accidental legacy identifier match(es).`,
        ...result.violations.map((match) => `- ${formatMatch(match)}`),
        '',
      ].join('\n'),
    };
  }

  return {
    exitCode: 0,
    stdout: [
      `Identity validation PASS: ${canonicalIdentity} is current; no accidental legacy identifiers found.`,
      `Allowed historical residual matches: ${result.allowed.length}`,
      ...result.allowed.map((match) => `- ${formatMatch(match)}`),
      '',
    ].join('\n'),
    stderr: '',
  };
}

const isMainModule = process.argv[1] !== undefined
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMainModule) {
  const output = formatValidationResult(await validateIdentity(repositoryRoot));
  process.stdout.write(output.stdout);
  process.stderr.write(output.stderr);
  process.exitCode = output.exitCode;
}

function classify(
  relativePath: string,
  match: Omit<ResidualMatch, 'path' | 'reason'>,
  symbolicLink: boolean,
  lineText = '',
  allowed: ResidualMatch[],
  violations: ResidualMatch[],
): void {
  const reason = !symbolicLink && (match.source === 'content' || match.source === 'path')
    && allowedFullTextPaths.has(relativePath)
    ? 'historical-record'
    : !symbolicLink && match.source === 'content' && relativePath === 'docs/approved-specification.md'
      && lineText.includes('superseded')
      && lineText.includes(canonicalIdentity)
      ? 'superseded-decision'
      : undefined;
  const fullMatch = { path: relativePath, ...match };
  if (reason === undefined) violations.push({ ...fullMatch, reason: 'unallowlisted' });
  else allowed.push({ ...fullMatch, reason });
}

function findMatches(line: string, source: MatchSource): Array<Omit<ResidualMatch, 'path' | 'reason'>> {
  const matches: Array<Omit<ResidualMatch, 'path' | 'reason'>> = [];
  legacyPattern.lastIndex = 0;
  for (const match of line.matchAll(legacyPattern)) {
    matches.push({
      line: 0,
      column: (match.index ?? 0) + 1,
      value: match[0],
      source,
    });
  }
  return matches;
}

function formatMatch(match: ResidualMatch): string {
  const location = match.source === 'path'
    ? `${match.path}:path`
    : match.source === 'target'
      ? `${match.path}:target:${match.line}:${match.column}`
      : `${match.path}:${match.line}:${match.column}`;
  return `${location} contains ${JSON.stringify(match.value)} (${match.reason})`;
}

async function listFiles(directory: string, relativeDirectory = ''): Promise<FileEntry[]> {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const files: FileEntry[] = [];
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'coverage') continue;
    const relativePath = relativeDirectory === '' ? entry.name : `${relativeDirectory}/${entry.name}`;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      files.push({ relativePath, symbolicLink: true });
    } else if (entry.isDirectory()) {
      files.push(...await listFiles(absolutePath, relativePath));
    } else if (entry.isFile()) {
      files.push({ relativePath, symbolicLink: false });
    }
  }
  return files;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
