import path from 'node:path';
import { execa } from 'execa';

export interface GitHubRepositoryIdentity {
  readonly host: string;
  readonly owner: string;
  readonly name: string;
  readonly remoteName: string;
  readonly display: string;
}

export interface RepositoryInspection {
  readonly root: string;
  readonly gitDirectory: string;
  readonly github: GitHubRepositoryIdentity;
}

export class RepositoryInspectionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RepositoryInspectionError';
  }
}

interface GitRemote {
  readonly name: string;
  readonly url: string;
}

export async function inspectRepository(candidatePath: string): Promise<RepositoryInspection> {
  const requested = path.resolve(candidatePath);
  let root: string;
  let gitDirectory: string;

  try {
    const [rootResult, gitDirectoryResult] = await Promise.all([
      execa('git', ['-C', requested, 'rev-parse', '--show-toplevel']),
      execa('git', ['-C', requested, 'rev-parse', '--absolute-git-dir']),
    ]);
    root = path.resolve(rootResult.stdout.trim());
    gitDirectory = path.resolve(gitDirectoryResult.stdout.trim());
  } catch {
    throw new RepositoryInspectionError(`Not a Git repository: ${requested}`);
  }

  let remoteOutput: string;
  try {
    remoteOutput = (await execa('git', ['-C', root, 'remote', '-v'])).stdout;
  } catch {
    throw new RepositoryInspectionError('Unable to inspect Git remotes.');
  }

  const remotes = parseFetchRemotes(remoteOutput);
  const candidates = [...remotes].sort((a, b) => {
    if (a.name === 'origin' && b.name !== 'origin') return -1;
    if (b.name === 'origin' && a.name !== 'origin') return 1;
    return a.name.localeCompare(b.name);
  });

  for (const remote of candidates) {
    const parsed = parseGitHubRemote(remote);
    if (parsed !== undefined) {
      return { root, gitDirectory, github: parsed };
    }
  }

  throw new RepositoryInspectionError('The repository has no recognizable GitHub remote.');
}

function parseFetchRemotes(output: string): GitRemote[] {
  const seen = new Set<string>();
  const remotes: GitRemote[] = [];
  for (const line of output.split(/\r?\n/u)) {
    const match = /^(\S+)\s+(\S+)\s+\(fetch\)$/u.exec(line.trim());
    if (match === null) continue;
    const name = match[1];
    const url = match[2];
    if (name === undefined || url === undefined || seen.has(name)) continue;
    seen.add(name);
    remotes.push({ name, url });
  }
  return remotes;
}

export function parseGitHubRemote(remote: GitRemote): GitHubRepositoryIdentity | undefined {
  let host: string;
  let repositoryPath: string;

  const scpMatch = /^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/u.exec(remote.url);
  if (scpMatch !== null && !remote.url.includes('://')) {
    host = scpMatch[1] ?? '';
    repositoryPath = scpMatch[2] ?? '';
  } else {
    try {
      const url = new URL(remote.url);
      if (!['http:', 'https:', 'ssh:', 'git:'].includes(url.protocol)) return undefined;
      host = url.hostname;
      repositoryPath = url.pathname.replace(/^\//u, '');
    } catch {
      return undefined;
    }
  }

  const segments = repositoryPath.replace(/\.git$/u, '').split('/').filter(Boolean);
  if (host.length === 0 || segments.length !== 2) return undefined;
  const owner = segments[0];
  const name = segments[1];
  if (owner === undefined || name === undefined) return undefined;

  const normalizedHost = host.toLowerCase();
  const isGitHub = normalizedHost === 'github.com' || normalizedHost.endsWith('.ghe.com');
  if (!isGitHub) return undefined;

  return {
    host: normalizedHost,
    owner,
    name,
    remoteName: remote.name,
    display: `${normalizedHost}/${owner}/${name}`,
  };
}
