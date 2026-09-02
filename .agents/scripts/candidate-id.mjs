#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const baseArgument = process.argv[2];

if (!baseArgument || process.argv.length !== 3) {
  console.error('Usage: node .agents/scripts/candidate-id.mjs <fixed-point>');
  process.exit(2);
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: options.encoding,
    maxBuffer: 64 * 1024 * 1024,
  });
}

const repositoryRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();

let base;
let head;

try {
  base = git(['rev-parse', '--verify', `${baseArgument}^{commit}`], {
    encoding: 'utf8',
  }).trim();
  head = git(['rev-parse', '--verify', 'HEAD^{commit}'], {
    encoding: 'utf8',
  }).trim();
} catch {
  console.error(`Unable to resolve fixed point or HEAD: ${baseArgument}`);
  process.exit(2);
}

const status = git(['status', '--porcelain=v1', '-z']);

if (status.length === 0) {
  const tree = git(['rev-parse', '--verify', 'HEAD^{tree}'], {
    encoding: 'utf8',
  }).trim();

  console.log(JSON.stringify({
    kind: 'committed',
    base,
    commit: head,
    tree,
    id: `${head}:${tree}`,
  }, null, 2));
  process.exit(0);
}

const hash = createHash('sha256');

function addSection(name, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  hash.update(Buffer.from(`${name}\0${bytes.length}\0`));
  hash.update(bytes);
}

addSection('base', base);
addSection('head', head);
addSection('committed-comparison', git([
  'diff', '--binary', '--full-index', '--no-ext-diff', base, head, '--',
]));
addSection('staged', git([
  'diff', '--cached', '--binary', '--full-index', '--no-ext-diff', head, '--',
]));
addSection('unstaged', git([
  'diff', '--binary', '--full-index', '--no-ext-diff', '--',
]));

const untracked = git([
  'ls-files', '--others', '--exclude-standard', '-z',
]).toString('utf8').split('\0').filter(Boolean).sort();

for (const path of untracked) {
  const absolutePath = resolve(repositoryRoot, path);
  const stat = lstatSync(absolutePath);
  const type = stat.isSymbolicLink() ? 'symlink' : 'file';
  const mode = (stat.mode & 0o777).toString(8);
  const contents = stat.isSymbolicLink()
    ? Buffer.from(readlinkSync(absolutePath))
    : readFileSync(absolutePath);

  addSection(`untracked-path:${path}`, `${type}:${mode}`);
  addSection(`untracked-bytes:${path}`, contents);
}

console.log(JSON.stringify({
  kind: 'wip',
  base,
  head,
  id: `sha256:${hash.digest('hex')}`,
  capture: 'committed-comparison + staged + unstaged + sorted untracked paths/bytes',
  untracked,
}, null, 2));
