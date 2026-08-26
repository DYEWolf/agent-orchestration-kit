import { describe, expect, it } from 'vitest';
import { parseGitHubRemote } from '../src/repository/inspection.js';

describe('GitHub remote parsing', () => {
  it.each([
    ['https://github.com/DYEWolf/orca-kit.git', 'github.com/DYEWolf/orca-kit'],
    ['git@github.com:DYEWolf/orca-kit.git', 'github.com/DYEWolf/orca-kit'],
    ['ssh://git@acme.ghe.com/DYEWolf/orca-kit.git', 'acme.ghe.com/DYEWolf/orca-kit'],
  ])('parses %s without exposing credentials', (url, display) => {
    expect(parseGitHubRemote({ name: 'origin', url })?.display).toBe(display);
  });

  it('rejects a non-GitHub remote', () => {
    expect(parseGitHubRemote({ name: 'origin', url: 'https://gitlab.com/acme/app.git' })).toBeUndefined();
  });

  it.each([
    'https://github.com.evil.example/acme/app.git',
    'https://notgithub.invalid/acme/app.git',
  ])('does not trust a lookalike host: %s', (url) => {
    expect(parseGitHubRemote({ name: 'origin', url })).toBeUndefined();
  });
});
