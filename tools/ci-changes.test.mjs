import {expect, it} from 'vitest';
import {classifyChanges, detectChanges} from './ci-changes.mjs';

it.each([
  'README.md',
  'README.zh-TW.md',
  'README.foo.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  'LICENSE',
  'LICENSE.md',
  'docs/a b\nc.md',
  '.github/ISSUE_TEMPLATE/bug.yml'
])('allows documentation path %s', path => expect(classifyChanges(`M\0${path}\0`).lane).toBe('docs'));

it.each([
  'contract/api-standardize/SOURCE.md',
  'src/README.md',
  'README.foo/bar.md',
  'src/README.foo/bar.md',
  'README-MIT.md',
  'LICENSES',
  'LICENSES/MIT',
  'LICENSE-MIT',
  'src/LICENSE.md',
  'src/docs/guide.md',
  'nested/docs-like/file.md',
  '.github/workflows/check.yml',
  'package.json',
  'docs-like/file.md'
])('requires full checks for %s', path => expect(classifyChanges(`M\0${path}\0`).lane).toBe('full'));

it('checks both ends of renames and copies and mixed paths', () => {
  expect(classifyChanges('R100\0README.md\0docs/guide.md\0').lane).toBe('docs');
  for (const status of ['R100', 'C100']) {
    expect(classifyChanges(`${status}\0README.md\0contract/SOURCE.md\0`).lane).toBe('full');
    expect(classifyChanges(`${status}\0contract/SOURCE.md\0README.md\0`).lane).toBe('full');
  }
  expect(classifyChanges('M\0README.md\0A\0src/main.ts\0').lane).toBe('full');
});

it.each(['', 'M\0README.md', 'M\0\0', 'R100\0README.md\0', '?\0README.md\0'])('falls back on empty or malformed diff %j', diff => {
  expect(classifyChanges(diff)).toEqual({lane: 'full', matrix: true});
});

it.each(['src/ui/Button.tsx', 'src/shell/routes.ts', 'src/features/example.css'])('includes the matrix for %s', path => {
  expect(classifyChanges(`R100\0${path}\0docs/guide.md\0`).matrix).toBe(true);
});

it('uses the event SHAs and diffs from their merge base', () => {
  const base = 'a'.repeat(40),
    head = 'b'.repeat(40),
    ancestor = 'c'.repeat(40);
  const calls = [];
  const result = detectChanges(base, head, args => {
    calls.push(args);
    return calls.length === 1 ? `${ancestor}\n` : 'M\0README.md\0';
  });
  expect(calls).toEqual([
    ['merge-base', base, head],
    ['diff', '--name-status', '-z', '-M', ancestor, head]
  ]);
  expect(result).toEqual({lane: 'docs', matrix: false});
});

it('falls back on git errors, missing event SHAs and empty output', () => {
  const sha = 'a'.repeat(40);
  expect(
    detectChanges(sha, sha, () => {
      throw new Error('diff failed');
    })
  ).toEqual({lane: 'full', matrix: true});
  expect(detectChanges(undefined, sha)).toEqual({lane: 'full', matrix: true});
  expect(detectChanges(sha, sha, args => (args[0] === 'merge-base' ? sha : ''))).toEqual({lane: 'full', matrix: true});
});

it.each([false, true])('fetches event histories with a full-history fallback: %s', deep => {
  const base = 'a'.repeat(40),
    head = 'b'.repeat(40),
    ancestor = 'c'.repeat(40);
  const calls = [];
  let attempts = 0;
  expect(
    detectChanges(base, head, args => {
      calls.push(args);
      if (args[0] === 'merge-base') {
        if (attempts++ < (deep ? 2 : 1)) throw new Error('shallow history');
        return ancestor;
      }
      return args[0] === 'diff' ? 'M\0README.md\0' : '';
    })
  ).toEqual({lane: 'docs', matrix: false});
  expect(calls).toEqual([
    ['merge-base', base, head],
    ['fetch', '--no-tags', '--depth=64', 'origin', base, head],
    ['merge-base', base, head],
    ...(deep
      ? [
          ['fetch', '--no-tags', '--unshallow', 'origin', base, head],
          ['merge-base', base, head]
        ]
      : []),
    ['diff', '--name-status', '-z', '-M', ancestor, head]
  ]);
});
