import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(repositoryRoot, '.github/workflows/release-matrix.yml');
const attributesPath = path.join(repositoryRoot, '.gitattributes');
const expectedGitAttributesRules = [
  '* text=auto eol=lf',
  '*.bat text eol=crlf',
  '*.cmd text eol=crlf',
] as const;
const expectedPairs = [
  ['ubuntu-latest', '22'],
  ['ubuntu-latest', '24'],
  ['ubuntu-latest', '26'],
  ['macos-latest', '22'],
  ['macos-latest', '24'],
  ['macos-latest', '26'],
  ['windows-latest', '22'],
  ['windows-latest', '24'],
  ['windows-latest', '26'],
] as const;
const expectedPairKeys = expectedPairs.map(([os, node]) => `${os}/node ${node}`);

export interface ReleaseMatrixValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface ReleaseMatrixValidationOutput {
  readonly exitCode: 0 | 1;
  readonly stdout: string;
  readonly stderr: string;
}

export function validateGitAttributes(source: string): ReleaseMatrixValidationResult {
  const actualRules = source
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  const errors: string[] = [];

  if (!actualRules.includes(expectedGitAttributesRules[0])) {
    errors.push('`.gitattributes` must normalize tracked text to LF with `* text=auto eol=lf`.');
  }
  for (const rule of expectedGitAttributesRules.slice(1)) {
    if (!actualRules.includes(rule)) {
      errors.push(`\`.gitattributes\` must preserve CRLF semantics for Windows command fixtures with \`${rule}\`.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateReleaseMatrix(source: string): ReleaseMatrixValidationResult {
  let workflow: unknown;
  try {
    workflow = parseYaml(source) as unknown;
  } catch (error) {
    return {
      valid: false,
      errors: [`Workflow YAML could not be parsed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  const errors: string[] = [];
  if (!isRecord(workflow)) {
    return { valid: false, errors: ['Workflow must be a YAML mapping.'] };
  }

  requireExactKeys(workflow, ['name', 'on', 'permissions', 'concurrency', 'jobs'], 'workflow', errors);
  if (workflow['name'] !== 'Release Matrix') {
    errors.push('workflow.name must be "Release Matrix".');
  }
  validateTriggers(workflow['on'], errors);
  validatePermissions(workflow['permissions'], errors);
  validateConcurrency(workflow['concurrency'], errors);
  validateJobs(workflow['jobs'], errors);

  return { valid: errors.length === 0, errors };
}

export function formatReleaseMatrixValidation(result: ReleaseMatrixValidationResult): ReleaseMatrixValidationOutput {
  if (result.valid) {
    return {
      exitCode: 0,
      stdout: 'Release matrix validation PASS: nine explicit Node/OS pairs satisfy the repository contract.\n',
      stderr: '',
    };
  }

  return {
    exitCode: 1,
    stdout: '',
    stderr: [
      `Release matrix validation FAIL: ${result.errors.length} contract violation(s).`,
      ...result.errors.map((error) => `- ${error}`),
      '',
    ].join('\n'),
  };
}

function validateTriggers(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('on must define exactly pull_request, push, and workflow_dispatch triggers.');
    return;
  }
  requireExactKeys(value, ['pull_request', 'push', 'workflow_dispatch'], 'on', errors);
  if (!isEmptyTrigger(value['pull_request'])) {
    errors.push('on.pull_request must not add filters.');
  }
  if (!isEmptyTrigger(value['workflow_dispatch'])) {
    errors.push('on.workflow_dispatch must not add inputs.');
  }
  const push = value['push'];
  if (!isRecord(push) || !sameKeys(push, ['branches']) || !sameStringArray(push['branches'], ['main'])) {
    errors.push('on.push.branches must be exactly [main].');
  }
}

function validatePermissions(value: unknown, errors: string[]): void {
  if (!isRecord(value) || !sameKeys(value, ['contents']) || value['contents'] !== 'read') {
    errors.push('permissions must be exactly { contents: read }.');
  }
}

function validateConcurrency(value: unknown, errors: string[]): void {
  if (!isRecord(value) || !sameKeys(value, ['group', 'cancel-in-progress'])
    || value['group'] !== 'release-matrix-${{ github.workflow }}-${{ github.ref }}'
    || value['cancel-in-progress'] !== true) {
    errors.push('concurrency must define the release-matrix group and cancel-in-progress: true.');
  }
}

function validateJobs(value: unknown, errors: string[]): void {
  if (!isRecord(value) || !sameKeys(value, ['release'])) {
    errors.push('jobs must contain exactly one release matrix job.');
    return;
  }
  const job = value['release'];
  if (!isRecord(job)) {
    errors.push('jobs.release must be a YAML mapping.');
    return;
  }
  requireExactKeys(job, ['name', 'runs-on', 'strategy', 'timeout-minutes', 'steps'], 'jobs.release', errors);
  if (job['name'] !== 'Node ${{ matrix.node }} on ${{ matrix.os }}') {
    errors.push('jobs.release.name must be the stable Node/matrix diagnostic name.');
  }
  if (job['runs-on'] !== '${{ matrix.os }}') {
    errors.push('jobs.release.runs-on must use matrix.os.');
  }
  if (job['timeout-minutes'] !== 20) {
    errors.push('jobs.release.timeout-minutes must be 20.');
  }
  validateStrategy(job['strategy'], errors);
  validateSteps(job['steps'], errors);
}

function validateStrategy(value: unknown, errors: string[]): void {
  if (!isRecord(value) || !sameKeys(value, ['fail-fast', 'matrix']) || value['fail-fast'] !== false) {
    errors.push('jobs.release.strategy.fail-fast must be false and strategy must define matrix.');
    return;
  }
  const matrix = value['matrix'];
  if (!isRecord(matrix) || !sameKeys(matrix, ['include']) || !Array.isArray(matrix['include'])) {
    errors.push('jobs.release.strategy.matrix must use an explicit include list.');
    return;
  }

  const pairs: string[] = [];
  for (const [index, candidate] of matrix['include'].entries()) {
    if (!isRecord(candidate) || !sameKeys(candidate, ['os', 'node'])
      || typeof candidate['os'] !== 'string' || typeof candidate['node'] !== 'string') {
      errors.push(`jobs.release.strategy.matrix.include[${index}] must contain only string os and node fields.`);
      continue;
    }
    pairs.push(`${candidate['os']}/node ${candidate['node']}`);
  }

  const actual = [...pairs].sort();
  const expected = [...expectedPairKeys].sort();
  if (actual.length !== expected.length || JSON.stringify(actual) !== JSON.stringify(expected)) {
    const actualSet = new Set(actual);
    const expectedSet = new Set(expected);
    const missing = expected.filter((pair) => !actualSet.has(pair));
    const unexpected = actual.filter((pair) => !expectedSet.has(pair));
    const details = [
      missing.length > 0 ? `missing ${missing.join(', ')}` : '',
      unexpected.length > 0 ? `unexpected ${unexpected.join(', ')}` : '',
    ].filter(Boolean).join('; ');
    errors.push(
      `jobs.release.strategy.matrix.include must contain exactly the nine supported OS/Node pairs; ${details || `found ${actual.length} entries`}.`,
    );
  }
}

function validateSteps(value: unknown, errors: string[]): void {
  if (!Array.isArray(value) || value.length !== 5) {
    errors.push('jobs.release.steps must contain exactly checkout, setup-node, npm ci, npm run check, and diagnostic upload steps.');
    return;
  }

  const [checkout, setupNode, install, check, upload] = value;
  if (!isRecord(checkout) || checkout['name'] !== 'Checkout' || checkout['uses'] !== 'actions/checkout@v7'
    || !sameKeys(checkout, ['name', 'uses', 'with'])
    || !isRecord(checkout['with']) || !sameKeys(checkout['with'], ['persist-credentials'])
    || checkout['with']['persist-credentials'] !== false) {
    errors.push('jobs.release.steps[0] must checkout with persist-credentials: false.');
  }
  if (!isRecord(setupNode) || setupNode['name'] !== 'Setup Node' || setupNode['uses'] !== 'actions/setup-node@v7'
    || !sameKeys(setupNode, ['name', 'uses', 'with']) || !isRecord(setupNode['with'])
    || !sameKeys(setupNode['with'], ['node-version'])
    || setupNode['with']['node-version'] !== '${{ matrix.node }}') {
    errors.push('jobs.release.steps[1] must setup Node from matrix.node without a dependency cache.');
  }
  if (!isRecord(install) || install['name'] !== 'Install dependencies' || install['shell'] !== 'bash'
    || typeof install['run'] !== 'string' || !isExactScript(install['run'], ['set -o pipefail', 'npm ci 2>&1 | tee release-matrix-output.log'])
    || !sameKeys(install, ['name', 'shell', 'run'])) {
    errors.push('jobs.release.steps[2] must run npm ci and retain its output in release-matrix-output.log.');
  }
  if (!isRecord(check) || check['name'] !== 'Run check' || check['shell'] !== 'bash'
    || typeof check['run'] !== 'string' || !isExactScript(check['run'], ['set -o pipefail', 'npm run check 2>&1 | tee -a release-matrix-output.log'])
    || !sameKeys(check, ['name', 'shell', 'run'])) {
    errors.push('jobs.release.steps[3] must run npm run check after npm ci and retain its output.');
  }
  if (!isRecord(upload) || upload['name'] !== 'Upload check diagnostics' || upload['if'] !== 'failure()'
    || upload['uses'] !== 'actions/upload-artifact@v7' || !sameKeys(upload, ['name', 'if', 'uses', 'with'])
    || !isRecord(upload['with']) || !sameKeys(upload['with'], ['name', 'path', 'if-no-files-found', 'retention-days'])
    || upload['with']['name'] !== 'release-matrix-${{ matrix.os }}-node-${{ matrix.node }}-${{ github.run_id }}-${{ github.run_attempt }}'
    || upload['with']['path'] !== 'release-matrix-output.log'
    || upload['with']['if-no-files-found'] !== 'error' || upload['with']['retention-days'] !== 14) {
    errors.push('jobs.release.steps[4] must upload failure diagnostics with a unique cross-platform artifact name.');
  }
}

function isExactScript(source: string, commands: readonly string[]): boolean {
  return source.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).join('\n') === commands.join('\n');
}

function requireExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string, errors: string[]): void {
  if (!sameKeys(value, expected)) {
    errors.push(`${label} must define exactly: ${expected.join(', ')}.`);
  }
}

function sameKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return JSON.stringify(actual) === JSON.stringify([...expected].sort());
}

function sameStringArray(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && value.length === expected.length
    && value.every((candidate, index) => candidate === expected[index]);
}

function isEmptyTrigger(value: unknown): boolean {
  return value === null || (isRecord(value) && Object.keys(value).length === 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isMainModule = process.argv[1] !== undefined
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMainModule) {
  const workflowResult = validateReleaseMatrix(await readFile(workflowPath, 'utf8'));
  const attributesResult = validateGitAttributes(await readFile(attributesPath, 'utf8').catch(() => ''));
  const result: ReleaseMatrixValidationResult = {
    valid: workflowResult.valid && attributesResult.valid,
    errors: [...workflowResult.errors, ...attributesResult.errors],
  };
  const output = formatReleaseMatrixValidation(result);
  process.stdout.write(output.stdout);
  process.stderr.write(output.stderr);
  process.exitCode = output.exitCode;
}
