import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect, it} from 'vitest';
import {classifyChanges, detectChanges} from './ci-changes.mjs';

it.each([
  'README.md',
  'README.zh-TW.md',
  'README.foo.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  'changes/fix-dns-worker-timeout.md',
  'changes/README.md',
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
  'src/ui/Button.tsx',
  'src/shell/routes.ts',
  'src/features/example.css',
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
  expect(classifyChanges(diff)).toEqual({lane: 'full', needsFragment: true});
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
  expect(result).toEqual({lane: 'docs', needsFragment: false});
});

it('falls back on git errors, missing event SHAs and empty output', () => {
  const sha = 'a'.repeat(40);
  expect(
    detectChanges(sha, sha, () => {
      throw new Error('diff failed');
    })
  ).toEqual({lane: 'full', needsFragment: true});
  expect(detectChanges(undefined, sha)).toEqual({lane: 'full', needsFragment: true});
  expect(detectChanges(sha, sha, args => (args[0] === 'merge-base' ? sha : ''))).toEqual({lane: 'full', needsFragment: true});
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
  ).toEqual({lane: 'docs', needsFragment: false});
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

it.each(['src/main.tsx', 'mock/backend.mjs', 'install/nix/default.nix', 'public/sw.js'])('requires a new fragment for %s', path => {
  const diff = `M\0${path}\0`;
  expect(classifyChanges(diff).needsFragment).toBe(true);
  expect(classifyChanges(`${diff}A\0changes/fix-example.md\0`).needsFragment).toBe(false);
  for (const fragment of [
    'M\0changes/fix-example.md\0',
    'D\0changes/fix-example.md\0',
    'A\0changes/README.md\0',
    'A\0changes/nested/fix.md\0',
    'R100\0changes/old.md\0changes/new.md\0',
    'C100\0changes/old.md\0changes/new.md\0'
  ]) {
    expect(classifyChanges(diff + fragment).needsFragment).toBe(true);
  }
});

it.each(['src/ui/tableFlow.test.ts', 'src/ui/component.test.tsx', 'mock/backend.test.mjs', 'e2e/table-flow.spec.ts', 'install/README.md', 'src/docs/guide.md'])(
  'exempts test or documentation-only changes to %s without weakening checks',
  path => {
    const diff = `M\0${path}\0`;
    expect(classifyChanges(diff)).toEqual({lane: 'full', needsFragment: false});
    expect(classifyChanges(`${diff}M\0src/main.ts\0`)).toEqual({lane: 'full', needsFragment: true});
  }
);

it('still requires a fragment for protected changelogs and tests renamed to shipped code', () => {
  expect(classifyChanges('M\0src/CHANGELOG.md\0').needsFragment).toBe(true);
  expect(classifyChanges('R100\0src/ui/tableFlow.test.ts\0src/ui/tableFlow.ts\0').needsFragment).toBe(true);
});

it('requires a fragment when a file is renamed out of a protected directory', () => {
  expect(classifyChanges('R100\0src/main.tsx\0tools/main.tsx\0').needsFragment).toBe(true);
});

it('enforces fragments and the no-changelog label through the CLI without changing lane selection', () => {
  const root = mkdtempSync(join(tmpdir(), 'doona-ci-changes-'));
  const tool = new URL('./ci-changes.mjs', import.meta.url).pathname;
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
  try {
    git('init', '-q');
    git('config', 'user.name', 'CI test');
    git('config', 'user.email', 'ci@example.invalid');
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/main.ts'), 'before\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    const base = git('rev-parse', 'HEAD');
    writeFileSync(join(root, 'src/main.ts'), 'after\n');
    git('add', '.');
    git('commit', '-qm', 'source change');
    let head = git('rev-parse', 'HEAD');
    const run = labels => {
      writeFileSync(join(root, 'event.json'), JSON.stringify({pull_request: {base: {sha: base}, head: {sha: head}, labels}}));
      writeFileSync(join(root, 'output'), '');
      return spawnSync(process.execPath, [tool], {
        cwd: root,
        encoding: 'utf8',
        env: {...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: join(root, 'event.json'), GITHUB_OUTPUT: join(root, 'output')}
      });
    };
    const missing = run([]);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('must add a new changes/<branch-slug>.md fragment');
    expect(run([{name: 'no-changelog'}]).status).toBe(0);
    expect(readFileSync(join(root, 'output'), 'utf8')).toBe('lane=full\n');
    expect(run([{name: 'other-label'}]).status).toBe(1);
    mkdirSync(join(root, 'changes'));
    writeFileSync(join(root, 'changes/fix-example.md'), 'Fixed\n\n- Source fix.\n');
    git('add', 'changes');
    git('commit', '-qm', 'add fragment');
    head = git('rev-parse', 'HEAD');
    expect(run([]).status).toBe(0);
    expect(readFileSync(join(root, 'output'), 'utf8')).toBe('lane=full\n');
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

it.each(['source plus added fragment', 'fragment-only addition', 'fragment-only modification'])(
  'rejects invalid committed fragments through the CLI: %s',
  scenario => {
    const root = mkdtempSync(join(tmpdir(), 'doona-ci-fragment-'));
    const tool = new URL('./ci-changes.mjs', import.meta.url).pathname;
    const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
    try {
      git('init', '-q');
      git('config', 'user.name', 'CI test');
      git('config', 'user.email', 'ci@example.invalid');
      mkdirSync(join(root, 'src'));
      mkdirSync(join(root, 'changes'));
      writeFileSync(join(root, 'src/main.ts'), 'before\n');
      if (scenario === 'fragment-only modification') writeFileSync(join(root, 'changes/fix-example.md'), 'Fixed\n\n- Valid entry.\n');
      git('add', '.');
      git('commit', '-qm', 'base');
      const base = git('rev-parse', 'HEAD');
      if (scenario === 'source plus added fragment') writeFileSync(join(root, 'src/main.ts'), 'after\n');
      writeFileSync(join(root, 'changes/fix-example.md'), 'Fix\n\n- Correct the behavior.\n');
      git('add', '.');
      git('commit', '-qm', 'invalid fragment');
      const head = git('rev-parse', 'HEAD');
      // Validate the PR head, not an unrelated checkout or uncommitted correction.
      writeFileSync(join(root, 'changes/fix-example.md'), 'Fixed\n\n- Correct the behavior.\n');
      for (const labels of [[], [{name: 'no-changelog'}]]) {
        writeFileSync(join(root, 'event.json'), JSON.stringify({pull_request: {base: {sha: base}, head: {sha: head}, labels}}));
        const result = spawnSync(process.execPath, [tool], {
          cwd: root,
          encoding: 'utf8',
          env: {...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: join(root, 'event.json'), GITHUB_OUTPUT: join(root, 'output')}
        });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("changes/fix-example.md: expected a changelog type followed by one or more '- ' bullet lines");
      }
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  }
);
