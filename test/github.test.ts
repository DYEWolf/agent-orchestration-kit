import path from 'node:path';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { NodeGitHubAdapter } from '../src/adapters/github/node-github.js';
import { READY_FOR_AGENT_LABEL, requiredGitHubActions } from '../src/adapters/github/github.js';
import type { GitHubLabelAction } from '../src/adapters/github/github.js';

const repository = {
  host: 'github.com',
  owner: 'DYEWolf',
  name: 'fixture',
  remoteName: 'origin',
  display: 'github.com/DYEWolf/fixture',
} as const;
const repositoryNodeId = 'R_fixture';

const fakeSource = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const mode = process.env.AOK_GH_MODE || 'exact';
const requestedHost = args.includes('--hostname') ? args[args.indexOf('--hostname') + 1] : 'github.com';
const query = args.find((arg) => arg.startsWith('query='))?.slice('query='.length) || '';
const valueFor = (name) => {
  const index = args.indexOf('-f');
  const values = [];
  for (let cursor = 0; cursor < args.length; cursor += 1) if (args[cursor] === '-f') values.push(args[cursor + 1]);
  const entry = values.find((value) => value?.startsWith(name + '='));
  return entry?.slice(name.length + 1);
};
const requestedName = valueFor('name') || 'fixture';
if (process.env.AOK_GH_LOG) fs.appendFileSync(process.env.AOK_GH_LOG, JSON.stringify(args) + '\\n');
const emit = (value) => process.stdout.write(JSON.stringify(value) + '\\n');
if (args.length === 1 && args[0] === '--version') {
  if (mode === 'cli-fail') process.exit(7);
  if (mode === 'cli-malformed') process.stdout.write('{broken\\n');
  else process.stdout.write('gh version 2.96.0 (fake)\\n');
} else if (args[0] === 'auth') {
  if (mode === 'auth-fail') process.exit(7);
  if (mode === 'auth-malformed') emit({ hosts: 'bad' });
  else emit({ hosts: mode === 'wrong-host' ? { 'ghe.example': [{ active: true }] } : { [requestedHost]: [{ active: mode !== 'unauthenticated' }] } });
} else if (args[0] === 'api' && args[1] === 'graphql' && query.includes('repository(owner:')) {
  if (mode === 'repo-fail') process.exit(7);
  if (mode === 'repo-errors-non-array') emit({ data: { repository: { id: 'R_fixture', nameWithOwner: 'DYEWolf/fixture' } }, errors: { message: 'secret-sentinel' } });
  else if (mode === 'repo-errors-array') emit({ data: { repository: { id: 'R_fixture', nameWithOwner: 'DYEWolf/fixture' } }, errors: [{ message: 'secret-sentinel' }] });
  else if (mode === 'repo-top-level-array') emit([]);
  else if (mode === 'repo-missing-data') emit({ errors: [] });
  else if (mode === 'repo-data-null') emit({ data: null });
  else if (mode === 'repo-null') emit({ data: { repository: null } });
  else if (mode === 'repo-malformed') emit({ data: { repository: { id: 'R_fixture' } } });
  else if (mode === 'repo-wrong-types') emit({ data: { repository: { id: 42, nameWithOwner: true } } });
  else emit({ data: { repository: {
    id: mode === 'repo-id-changed' ? 'R_other' : 'R_fixture',
    nameWithOwner: mode === 'repo-mismatch' || mode === 'repo-renamed' ? 'DYEWolf/renamed' : 'DYEWolf/' + requestedName,
  } } });
} else if (args[0] === 'api' && args[1] === 'graphql' && query.includes('node(id:')) {
  if (mode === 'label-fail') process.exit(7);
  if (mode === 'read-timeout') setTimeout(() => {}, 30_000);
  if (mode === 'label-errors-non-array') emit({ data: { node: { label: null } }, errors: { message: 'secret-sentinel' } });
  else if (mode === 'label-errors-array') emit({ data: { node: { label: null } }, errors: [{ message: 'secret-sentinel' }] });
  else if (mode === 'label-top-level-array') emit([]);
  else if (mode === 'label-missing-data') emit({ errors: [] });
  else if (mode === 'label-data-null') emit({ data: null });
  else if (mode === 'label-null-node') emit({ data: { node: null } });
  else if (mode === 'label-unexpected-node') emit({ data: { node: 'not-a-repository' } });
  else if (mode === 'label-missing-property') emit({ data: { node: { id: 'R_fixture' } } });
  else if (mode === 'label-api-fail') emit({ errors: [{ message: 'secret-sentinel' }] });
  else if (mode === 'label-malformed') emit({ data: { node: { label: { name: 'ready-for-agent' } } } });
  else if (mode === 'label-wrong-types') emit({ data: { node: { label: { name: 'ready-for-agent', color: 14, description: false } } } });
  else if (mode === 'missing' || mode === 'missing-over-1000' || mode === 'missing-create-fail' || mode === 'missing-mutation-timeout' || mode.startsWith('mutation-')) emit({ data: { node: { label: null } } });
  else if (mode === 'drift') emit({ data: { node: { label: { name: 'READY-FOR-AGENT', color: '0E8A16', description: 'old' } } } });
  else if (mode === 'case-collision') emit({ data: { node: { label: { name: 'READY-FOR-AGENT', color: '0E8A16', description: ${JSON.stringify(READY_FOR_AGENT_LABEL.description)} } } } });
  else if (process.env.AOK_GH_STATE && fs.existsSync(process.env.AOK_GH_STATE)) emit({ data: { node: { label: { name: 'ready-for-agent', color: '0e8a16', description: ${JSON.stringify(READY_FOR_AGENT_LABEL.description)} } } } });
  else emit({ data: { node: { label: { name: 'ready-for-agent', color: '0e8a16', description: ${JSON.stringify(READY_FOR_AGENT_LABEL.description)} } } } });
} else if (args[0] === 'api' && args[1] === 'graphql' && query.includes('mutation(')) {
  if (process.env.AOK_GH_LOG) fs.appendFileSync(process.env.AOK_GH_LOG, 'create\\n');
  if (mode === 'mutation-timeout' || mode === 'missing-mutation-timeout') setTimeout(() => {}, 30_000);
  if (mode === 'create-fail' || mode === 'missing-create-fail') process.exit(9);
  if (mode === 'mutation-malformed-json') process.stdout.write('{malformed secret-sentinel\\n');
  else if (mode === 'mutation-errors-non-array') emit({ data: { createLabel: { label: null } }, errors: { message: 'secret-sentinel' } });
  else if (mode === 'mutation-errors-array') emit({ data: { createLabel: { label: null } }, errors: [{ message: 'secret-sentinel' }] });
  else if (mode === 'mutation-top-level-array') emit([]);
  else if (mode === 'mutation-data-null') emit({ data: null });
  else if (mode === 'mutation-null') emit({ data: { createLabel: null } });
  else if (mode === 'mutation-partial') emit({ data: { createLabel: { label: { name: 'ready-for-agent' } } } });
  else if (mode === 'mutation-wrong-name') emit({ data: { createLabel: { label: { name: 'not-ready-for-agent', color: '0E8A16', description: ${JSON.stringify(READY_FOR_AGENT_LABEL.description)}, repository: { id: 'R_fixture' } } } } });
  else if (mode === 'mutation-wrong-metadata') emit({ data: { createLabel: { label: { name: 'ready-for-agent', color: 'FFFFFF', description: 'wrong', repository: { id: 'R_fixture' } } } } });
  else if (mode === 'mutation-wrong-repository-id') emit({ data: { createLabel: { label: { name: 'ready-for-agent', color: '0E8A16', description: ${JSON.stringify(READY_FOR_AGENT_LABEL.description)}, repository: { id: 'R_other' } } } } });
  else emit({ data: { createLabel: { label: { name: 'ready-for-agent', color: '0E8A16', description: ${JSON.stringify(READY_FOR_AGENT_LABEL.description)}, repository: { id: 'R_fixture' } } } } });
} else process.exit(8);
`;

const otherRepository = {
  ...repository,
  name: 'other-fixture',
  display: 'github.com/DYEWolf/other-fixture',
} as const;

describe('GitHub adapter', () => {
  it('uses explicit host/repository argv, directly looks up the exact label, and recognizes exact metadata without authorizing a mutation', async () => {
    await withFakeGitHub('exact', async ({ adapter, log }) => {
      const discovery = await adapter.discover(repository);
      expect(discovery).toMatchObject({
        cli: { status: 'pass' }, auth: { status: 'pass' }, repository: { status: 'pass' },
        label: { status: 'pass' }, labelState: 'exact', canCreateLabel: false,
      });
      const receipt = await adapter.execute(requiredGitHubActions(repository, repositoryNodeId)[0]!);
      expect(receipt.status).toBe('failed');
      const calls = (await readFile(log, 'utf8')).trim().split('\n').map((line) => JSON.parse(line) as string[]);
      expect(calls).toEqual([
        ['--version'],
        ['auth', 'status', '--hostname', 'github.com', '--json', 'hosts'],
        ['api', 'graphql', '--hostname', 'github.com', '-f', expect.stringContaining('repository(owner:'), '-f', 'owner=DYEWolf', '-f', 'name=fixture'],
        ['api', 'graphql', '--hostname', 'github.com', '-f', expect.stringContaining('node(id:'), '-f', 'repositoryId=R_fixture', '-f', 'name=ready-for-agent'],
      ]);
    });
  });

  it('authorizes exactly one required action only after an authoritative missing-label discovery', async () => {
    await withFakeGitHub('missing', async ({ adapter, log }) => {
      const beforeDiscovery = await adapter.execute(requiredGitHubActions(repository, repositoryNodeId)[0]!);
      expect(beforeDiscovery).toEqual({ id: 'create-ready-for-agent-label', status: 'failed', message: 'GitHub action is unsupported or is not authorized by the latest verified discovery.' });
      await adapter.discover(repository);
      const forged = { ...requiredGitHubActions(repository, repositoryNodeId)[0]!, description: 'forged' } as unknown as GitHubLabelAction;
      await expect(adapter.execute(forged)).resolves.toMatchObject({ status: 'failed' });
      await expect(adapter.execute(requiredGitHubActions(repository, repositoryNodeId)[0]!)).resolves.toMatchObject({ status: 'executed' });
      await expect(adapter.execute(requiredGitHubActions(repository, repositoryNodeId)[0]!)).resolves.toMatchObject({ status: 'failed' });
      const calls = (await readFile(log, 'utf8')).trim().split('\n').filter((line) => line.startsWith('[')).map((line) => JSON.parse(line) as string[]);
      expect(calls.filter((call) => call[0] === 'api' && call[1] === 'graphql' && call.some((part) => part.includes('mutation(')))).toHaveLength(1);
    });
  });

  it('uses the direct GraphQL lookup for an exact missing label without a list cap', async () => {
    await withFakeGitHub('missing-over-1000', async ({ adapter, log }) => {
      const discovery = await adapter.discover(repository);
      expect(discovery).toMatchObject({ repositoryNodeId, labelState: 'missing', canCreateLabel: true });
      const calls = (await readFile(log, 'utf8')).trim().split('\n').filter((line) => line.startsWith('[')).map((line) => JSON.parse(line) as string[]);
      expect(calls.some((call) => call[0] === 'label' && call[1] === 'list')).toBe(false);
      expect(calls.some((call) => call.includes('--limit'))).toBe(false);
      expect(calls.filter((call) => call[0] === 'api' && call[1] === 'graphql' && call.some((part) => part.includes('node(id:')))).toHaveLength(1);
    });
  });

  it.each([
    ['non-array errors', 'repo-errors-non-array'],
    ['non-empty errors', 'repo-errors-array'],
    ['non-object top-level value', 'repo-top-level-array'],
    ['missing data', 'repo-missing-data'],
    ['non-object data', 'repo-data-null'],
    ['missing repository fields', 'repo-malformed'],
    ['wrong repository field types', 'repo-wrong-types'],
  ] as const)('rejects a malformed repository GraphQL envelope for %s', async (_label, mode) => {
    await withFakeGitHub(mode, async ({ adapter, log }) => {
      const discovery = await adapter.discover(repository);
      expect(discovery.repository.status).toBe('fail');
      expect(discovery.repositoryNodeId).toBeUndefined();
      expect(discovery.labelState).toBe('unavailable');
      expect(discovery.canCreateLabel).toBe(false);
      expect(JSON.stringify(discovery)).not.toContain('secret-sentinel');
      await expect(adapter.execute(requiredGitHubActions(repository, repositoryNodeId)[0]!)).resolves.toMatchObject({ status: 'failed' });
      expect((await readFile(log, 'utf8')).split('\n').filter((line) => line === 'create')).toHaveLength(0);
    });
  });

  it('treats an explicit null repository as unreadable and never authorizes a mutation', async () => {
    await withFakeGitHub('repo-null', async ({ adapter, log }) => {
      const discovery = await adapter.discover(repository);
      expect(discovery.repository).toMatchObject({ status: 'fail', reason: 'repository-unreadable' });
      expect(discovery.repositoryNodeId).toBeUndefined();
      expect(discovery.canCreateLabel).toBe(false);
      await expect(adapter.execute(requiredGitHubActions(repository, repositoryNodeId)[0]!)).resolves.toMatchObject({ status: 'failed' });
      expect((await readFile(log, 'utf8')).split('\n').filter((line) => line === 'create')).toHaveLength(0);
    });
  });

  it.each([
    ['non-array errors', 'label-errors-non-array'],
    ['non-empty errors', 'label-errors-array'],
    ['non-object top-level value', 'label-top-level-array'],
    ['missing data', 'label-missing-data'],
    ['non-object data', 'label-data-null'],
    ['null node', 'label-null-node'],
    ['unexpected node type', 'label-unexpected-node'],
    ['missing label property', 'label-missing-property'],
    ['malformed label', 'label-malformed'],
  ] as const)('never treats an unavailable label response as authoritative absence for %s', async (_label, mode) => {
    await withFakeGitHub(mode, async ({ adapter, log }) => {
      const discovery = await adapter.discover(repository);
      expect(discovery.label.status).toBe('fail');
      expect(discovery.labelState).toBe('unavailable');
      expect(discovery.canCreateLabel).toBe(false);
      expect(JSON.stringify(discovery)).not.toContain('secret-sentinel');
      await expect(adapter.execute(requiredGitHubActions(repository, repositoryNodeId)[0]!)).resolves.toMatchObject({ status: 'failed' });
      expect((await readFile(log, 'utf8')).split('\n').filter((line) => line === 'create')).toHaveLength(0);
    });
  });

  it('binds authorization to the verified immutable repository node ID and name', async () => {
    await withFakeGitHub('repo-id-changed', async ({ adapter, log }) => {
      const discovery = await adapter.discover(repository);
      expect(discovery).toMatchObject({ repository: { status: 'pass' }, repositoryNodeId: 'R_other', repositoryNameWithOwner: 'DYEWolf/fixture' });
      await expect(adapter.execute(requiredGitHubActions(repository, repositoryNodeId)[0]!)).resolves.toMatchObject({ status: 'failed' });
      expect((await readFile(log, 'utf8')).split('\n').filter((line) => line === 'create')).toHaveLength(0);
    });
    for (const mode of ['repo-renamed', 'repo-mismatch'] as const) {
      await withFakeGitHub(mode, async ({ adapter, log }) => {
        const discovery = await adapter.discover(repository);
        expect(discovery.repository.status).toBe('fail');
        expect(discovery.repositoryNodeId).toBeUndefined();
        await expect(adapter.execute(requiredGitHubActions(repository, repositoryNodeId)[0]!)).resolves.toMatchObject({ status: 'failed' });
        expect((await readFile(log, 'utf8')).split('\n').filter((line) => line === 'create')).toHaveLength(0);
      });
    }
  });

  it('clears authorization after exact, drift, failed, and another-identity discovery', async () => {
    for (const mode of ['exact', 'drift', 'repo-fail', 'missing'] as const) {
      await withFakeGitHub(mode, async ({ adapter, log }) => {
        await adapter.discover(repository);
        if (mode === 'missing') await adapter.discover(otherRepository);
        const receipt = await adapter.execute(requiredGitHubActions(repository, repositoryNodeId)[0]!);
        expect(receipt.status).toBe('failed');
      const calls = (await readFile(log, 'utf8')).trim().split('\n').filter((line) => line.startsWith('[')).map((line) => JSON.parse(line) as string[]);
      expect(calls.filter((call) => call[0] === 'api' && call[1] === 'graphql' && call.some((part) => part.includes('mutation(')))).toHaveLength(0);
      });
    }
  });

  it('plans only an authoritative missing label and never plans a case-collision drift', async () => {
    await withFakeGitHub('missing', async ({ adapter }) => {
      await expect(adapter.discover(repository)).resolves.toMatchObject({ labelState: 'missing', canCreateLabel: true, label: { status: 'fail' } });
    });
    await withFakeGitHub('drift', async ({ adapter }) => {
      await expect(adapter.discover(repository)).resolves.toMatchObject({ labelState: 'drift', canCreateLabel: false, label: { status: 'warn' } });
    });
    await withFakeGitHub('case-collision', async ({ adapter }) => {
      await expect(adapter.discover(repository)).resolves.toMatchObject({ labelState: 'drift', canCreateLabel: false, label: { status: 'warn' } });
    });
  });

  it.each([
    ['missing CLI', 'cli-fail', 'cli'],
    ['unauthenticated host', 'wrong-host', 'auth'],
    ['unauthenticated account', 'unauthenticated', 'auth'],
    ['malformed auth response', 'auth-malformed', 'auth'],
    ['repository failure', 'repo-fail', 'repository'],
    ['malformed repository response', 'repo-malformed', 'repository'],
    ['repository mismatch', 'repo-mismatch', 'repository'],
    ['label read failure', 'label-fail', 'label'],
    ['malformed labels', 'label-malformed', 'label'],
    ['GitHub API label failure', 'label-api-fail', 'label'],
  ] as const)('returns sanitized prerequisite diagnostics for %s', async (_label, mode, check) => {
    await withFakeGitHub(mode, async ({ adapter }) => {
      const discovery = await adapter.discover(repository);
      expect(discovery[check].status).toBe('fail');
      expect(JSON.stringify(discovery)).not.toContain('secret-sentinel');
    });
  });

  it('returns a sanitized failure receipt for a mutation process failure', async () => {
    await withFakeGitHub('missing-create-fail', async ({ adapter, log }) => {
      await adapter.discover(repository);
      const receipt = await adapter.execute(requiredGitHubActions(repository, repositoryNodeId)[0]!);
      expect(receipt).toEqual({ id: 'create-ready-for-agent-label', status: 'failed', message: 'GitHub ready-for-agent label creation failed.' });
      expect(JSON.stringify(receipt)).not.toContain('secret-sentinel');
      const calls = (await readFile(log, 'utf8')).trim().split('\n').filter((line) => line.startsWith('[')).map((line) => JSON.parse(line) as string[]);
      expect(calls.filter((call) => call[0] === 'api' && call[1] === 'graphql' && call.some((part) => part.includes('mutation(')))).toHaveLength(1);
    });
  });

  it.each([
    ['malformed JSON', 'mutation-malformed-json'],
    ['non-array errors', 'mutation-errors-non-array'],
    ['non-empty errors', 'mutation-errors-array'],
    ['non-object top-level value', 'mutation-top-level-array'],
    ['non-object data', 'mutation-data-null'],
    ['null createLabel', 'mutation-null'],
    ['partial createLabel label', 'mutation-partial'],
    ['wrong label name', 'mutation-wrong-name'],
    ['wrong label metadata', 'mutation-wrong-metadata'],
    ['wrong repository ID', 'mutation-wrong-repository-id'],
  ] as const)('returns a sanitized failed receipt for mutation response with %s and consumes authorization', async (_label, mode) => {
    await withFakeGitHub(mode, async ({ adapter, log }) => {
      await adapter.discover(repository);
      const action = requiredGitHubActions(repository, repositoryNodeId)[0]!;
      const receipt = await adapter.execute(action);
      expect(receipt).toMatchObject({ id: 'create-ready-for-agent-label', status: 'failed' });
      expect(JSON.stringify(receipt)).not.toContain('secret-sentinel');
      await expect(adapter.execute(action)).resolves.toMatchObject({ status: 'failed' });
      expect((await readFile(log, 'utf8')).split('\n').filter((line) => line === 'create')).toHaveLength(1);
    });
  });

  it('classifies a genuinely missing executable as ENOENT and never creates from it', async () => {
    const temporary = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-gh-missing-executable-'));
    try {
      const adapter = new NodeGitHubAdapter({ executable: path.join(temporary, 'does-not-exist') });
      const discovery = await adapter.discover(repository);
      expect(discovery).toMatchObject({ cli: { status: 'fail', reason: 'missing' }, canCreateLabel: false, labelState: 'unavailable' });
      const receipt = await adapter.execute(requiredGitHubActions(repository, repositoryNodeId)[0]!);
      expect(receipt).toEqual({ id: 'create-ready-for-agent-label', status: 'failed', message: 'GitHub action is unsupported or is not authorized by the latest verified discovery.' });
      expect(JSON.stringify(discovery)).not.toContain('ENOENT');
      expect(JSON.stringify(receipt)).not.toContain('ENOENT');
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('sanitizes a generic mutation process launch failure', async () => {
    await withFakeGitHub('missing', async ({ adapter, executable, log }) => {
      await adapter.discover(repository);
      await rm(executable);
      await mkdir(executable);
      const receipt = await adapter.execute(requiredGitHubActions(repository, repositoryNodeId)[0]!);
      expect(receipt).toMatchObject({ id: 'create-ready-for-agent-label', status: 'failed', message: expect.any(String) });
      expect(JSON.stringify(receipt)).not.toContain('secret-sentinel');
      expect((await readFile(log, 'utf8')).split('\n').filter((line) => line === 'create')).toHaveLength(0);
    });
  });

  it('classifies read and mutation timeouts without exposing process output', async () => {
    await withFakeGitHub('read-timeout', async ({ adapter }) => {
      const discovery = await adapter.discover(repository);
      expect(discovery.cli.status).toBe('pass');
      expect(discovery.label.reason).toBe('label-read-failure');
      expect(discovery.label.message).toContain('authoritatively');
    }, { timeoutMs: 250 });
    await withFakeGitHub('missing-mutation-timeout', async ({ adapter }) => {
      await adapter.discover(repository);
      const receipt = await adapter.execute(requiredGitHubActions(repository, repositoryNodeId)[0]!);
      expect(receipt).toMatchObject({ status: 'failed' });
      expect(receipt.message).toContain('timed out');
    }, { timeoutMs: 250 });
  });
});

async function withFakeGitHub(mode: string, callback: (context: { adapter: NodeGitHubAdapter; executable: string; log: string }) => Promise<void>, options: { timeoutMs?: number } = {}): Promise<void> {
  const temporary = await mkdtemp(path.join(tmpdir(), 'agent-orchestration-kit-gh-test-'));
  const executable = path.join(temporary, 'gh');
  const log = path.join(temporary, 'argv.log');
  try {
    await writeFile(executable, fakeSource, { encoding: 'utf8', mode: 0o755 });
    await chmod(executable, 0o755);
    await writeFile(log, '');
    await callback({ adapter: new NodeGitHubAdapter({
      executable,
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      env: { ...process.env, AOK_GH_MODE: mode, AOK_GH_LOG: log },
    }), executable, log });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
