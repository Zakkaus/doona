import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, expect, it} from 'vitest';
import {fragmentNote, parseFragment, release, render} from './changelog.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, {recursive: true, force: true})));
const git = (root, ...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
const history =
  '\n## [1.0.0] - 2026-09-30\n\n### Fixed\n\n- Previous fix. (#7)\n\n[Unreleased]: https://github.com/example/project/compare/v1.0.0...HEAD\n[1.0.0]: https://github.com/example/project/releases/tag/v1.0.0\n';
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'doona-changelog-'));
  roots.push(root);
  mkdirSync(join(root, 'changes'));
  writeFileSync(join(root, 'changes/README.md'), '# Not a fragment\n');
  writeFileSync(join(root, 'CHANGELOG.md'), `# Changelog\n\n## [Unreleased]\n\n${fragmentNote}\n${history}`);
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Changelog test');
  git(root, 'config', 'user.email', 'changelog@example.invalid');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'initial release');
  return root;
}
function add(root, name, text) {
  writeFileSync(join(root, 'changes', name), text);
  git(root, 'add', 'changes');
  git(root, 'commit', '-qm', 'add fragment');
  return git(root, 'rev-parse', 'HEAD');
}
const offline = program => {
  throw new Error(`${program} unavailable`);
};

it('groups fragments in changelog order and resolves the adding commit, not later edits', () => {
  const root = fixture();
  const internal = add(root, 'a-internal.md', 'Internal\n\n- Contributor tooling.\n');
  const fixed = add(root, 'z-fix.md', 'Fixed\n\n- First fix.\n- Second fix.\n');
  const added = add(root, 'b-add.md', 'Added\n\n- New feature.\n');
  writeFileSync(join(root, 'changes/z-fix.md'), 'Fixed\n\n- Edited fix.\n- Second fix.\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'edit fragment');
  const numbers = new Map([
    [internal, 10],
    [fixed, 11],
    [added, 12]
  ]);
  const run = (program, args) => {
    if (program === 'git') return execFileSync(program, args, {cwd: root, encoding: 'utf8'});
    const sha = args[1].match(/commits\/([a-f0-9]+)\/pulls$/)[1];
    if (!numbers.has(sha)) throw new Error('wrong commit');
    return JSON.stringify([
      {number: 99, merged_at: null},
      {number: numbers.get(sha), merged_at: '2026-10-01'}
    ]);
  };
  expect(render(root, run).section).toBe(
    '## [Unreleased]\n\n### Added\n\n- New feature. (#12)\n\n### Fixed\n\n- Edited fix. (#11)\n- Second fix. (#11)\n\n### Internal\n\n- Contributor tooling. (#10)\n'
  );
});

it.each(['unavailable', 'no associated PR'])('renders entries without numbers and warns when GitHub is %s', failure => {
  const root = fixture();
  add(root, 'fix.md', 'Fixed\n\n- Offline fix.\n');
  const warnings = [];
  const run = (program, args) => {
    if (program === 'git') return execFileSync(program, args, {cwd: root, encoding: 'utf8'});
    if (failure === 'unavailable') throw new Error('offline');
    return '[]';
  };
  expect(render(root, run, warning => warnings.push(warning)).section).toBe('## [Unreleased]\n\n### Fixed\n\n- Offline fix.\n');
  expect(warnings).toEqual([expect.stringContaining('changes/fix.md: omitting PR number:')]);
});

it('warns for uncommitted fragments and renders an empty directory without categories', () => {
  const root = fixture();
  expect(render(root).section).toBe('## [Unreleased]\n');
  writeFileSync(join(root, 'changes/new.md'), 'Added\n\n- Uncommitted change.\n');
  const warnings = [];
  expect(render(root, undefined, warning => warnings.push(warning)).section).toContain('- Uncommitted change.\n');
  expect(warnings).toEqual([expect.stringContaining('no commit adding this fragment')]);
});

it.each(['Other\n- Entry.', 'Fixed', 'Fixed\nEntry.', 'Fixed\n- '])('rejects malformed fragments: %j', text => {
  expect(() => parseFragment(text, 'bad.md')).toThrow('bad.md: expected a changelog type');
});

it('releases fragments, updates comparison links and preserves earlier releases and the guide', () => {
  const root = fixture();
  add(root, 'fix.md', 'Fixed\n\n- Released fix.\n');
  add(root, 'internal.md', 'Internal\n\n- Tooling change.\n');
  release('1.1.0-beta.1', '2026-10-03', root, offline, () => {});
  expect(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')).toBe(
    `# Changelog\n\n## [Unreleased]\n\n${fragmentNote}\n\n## [1.1.0-beta.1] - 2026-10-03\n\n### Fixed\n\n- Released fix.\n\n### Internal\n\n- Tooling change.\n` +
      history.replace(
        '[Unreleased]: https://github.com/example/project/compare/v1.0.0...HEAD',
        '[Unreleased]: https://github.com/example/project/compare/v1.1.0-beta.1...HEAD\n[1.1.0-beta.1]: https://github.com/example/project/compare/v1.0.0...v1.1.0-beta.1'
      )
  );
  expect(readdirSync(join(root, 'changes'))).toEqual(['README.md']);
});

it('preserves literal replacement tokens when releasing fragments', () => {
  const root = fixture();
  const bullet = "- Preserve `$&`, `$'`, `$``, `$$`, and `$1` in replacement expressions.";
  add(root, 'replacement-tokens.md', `Fixed\n\n${bullet}\n`);
  release('1.1.0', '2026-10-03', root, offline, () => {});
  expect(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')).toBe(
    `# Changelog\n\n## [Unreleased]\n\n${fragmentNote}\n\n## [1.1.0] - 2026-10-03\n\n### Fixed\n\n${bullet}\n` +
      history.replace(
        '[Unreleased]: https://github.com/example/project/compare/v1.0.0...HEAD',
        '[Unreleased]: https://github.com/example/project/compare/v1.1.0...HEAD\n[1.1.0]: https://github.com/example/project/compare/v1.0.0...v1.1.0'
      )
  );
  expect(readdirSync(join(root, 'changes'))).toEqual(['README.md']);
});

it.each([
  ['v1.1.0', '2026-10-03'],
  ['1.01.0', '2026-10-03'],
  ['1.1.0', '2026-02-30'],
  ['1.0.0', '2026-10-03']
])('refuses invalid or duplicate release %s on %s without consuming fragments', (version, date) => {
  const root = fixture();
  add(root, 'fix.md', 'Fixed\n\n- Keep this fix.\n');
  const before = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
  expect(() => release(version, date, root, offline)).toThrow();
  expect(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')).toBe(before);
  expect(readFileSync(join(root, 'changes/fix.md'), 'utf8')).toContain('Keep this fix.');
});

it('refuses to overwrite handwritten Unreleased entries or release an empty directory', () => {
  const root = fixture();
  expect(() => release('1.1.0', '2026-10-03', root)).toThrow('no changelog fragments');
  add(root, 'fix.md', 'Fixed\n\n- Keep this fix.\n');
  const handwritten = `# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Existing entry.\n${history}`;
  writeFileSync(join(root, 'CHANGELOG.md'), handwritten);
  expect(() => release('1.1.0', '2026-10-03', root)).toThrow('handwritten Unreleased');
  expect(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')).toBe(handwritten);
  expect(readFileSync(join(root, 'changes/fix.md'), 'utf8')).toContain('Keep this fix.');
});

it('orders every category and sorts filenames within a category', () => {
  const root = fixture();
  for (const type of ['Internal', 'Security', 'Removed', 'Fixed', 'Changed', 'Added']) {
    writeFileSync(join(root, `changes/z-${type.toLowerCase()}.md`), `${type}\n\n- ${type} entry.\n`);
  }
  writeFileSync(join(root, 'changes/a-fixed.md'), 'Fixed\n\n- Earlier filename.\n');
  const {section} = render(root, offline, () => {});
  expect(section.match(/^### .+$/gm)).toEqual(['### Added', '### Changed', '### Fixed', '### Removed', '### Security', '### Internal']);
  expect(section).toContain('### Fixed\n\n- Earlier filename.\n- Fixed entry.');
});

it('does not write a release or consume fragments if any fragment is malformed', () => {
  const root = fixture();
  writeFileSync(join(root, 'changes/good.md'), 'Fixed\n\n- Keep this fix.\n');
  writeFileSync(join(root, 'changes/bad.md'), 'Typo\n\n- Invalid entry.\n');
  const before = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
  expect(() => release('1.1.0', '2026-10-03', root, offline)).toThrow('bad.md: expected a changelog type');
  expect(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')).toBe(before);
  expect(readdirSync(join(root, 'changes')).sort()).toEqual(['README.md', 'bad.md', 'good.md']);
});
