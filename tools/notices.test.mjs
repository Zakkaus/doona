import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterEach, expect, it} from 'vitest';
import {citedLicenses, missingLicenses, NOTICES, PROGRAM_LICENSES, ROOT, stageNotices} from './notices.mjs';

const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true});
});

function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'doona-notices-'));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), {recursive: true});
    writeFileSync(join(dir, path), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

const licenses = Object.fromEntries(PROGRAM_LICENSES.map(id => [`LICENSES/${id}.txt`, `${id}\n`]));
const checkout = () =>
  tree({
    ...licenses,
    'package.json': {name: 'app', dependencies: {zeta: '1', '@scope/beta': '1'}},
    'node_modules/zeta/package.json': {name: 'zeta', version: '2.0.0', license: 'MIT', dependencies: {nolicence: '1'}},
    'node_modules/zeta/LICENSE': 'Zeta\r\nlicence\r\n',
    'node_modules/@scope/beta/package.json': {name: '@scope/beta', version: '1.0.0', license: {type: 'ISC'}, dependencies: {zeta: '2'}},
    'node_modules/@scope/beta/license.md': 'Beta licence\n',
    // Upper case sorts first, so COPYING wins over license.md.
    'node_modules/@scope/beta/COPYING': 'Beta copying\n',
    'node_modules/nolicence/package.json': {name: 'nolicence', version: '0.0.1', license: 'MIT'},
    'node_modules/vite/package.json': {name: 'vite', version: '6.0.0', license: 'MIT'},
    'node_modules/vite/LICENSE.md': [
      '# Vite core license',
      'Vite MIT',
      '',
      '# Licenses of bundled dependencies',
      '# Bundled dependencies:',
      '## @rollup/plugin-alias, @rollup/plugin-commonjs',
      'License: MIT',
      '> Plugins MIT',
      '',
      '---------------------------------------',
      '',
      '## other',
      'Not shipped',
      ''
    ].join('\r\n'),
    // Vite's own rollup: resolved from vite's directory, not the checkout's.
    'node_modules/vite/node_modules/rollup/package.json': {name: 'rollup', version: '4.0.0', license: 'MIT'},
    'node_modules/vite/node_modules/rollup/LICENSE.md': '# Rollup core license\nRollup MIT\n\n# Licenses of bundled dependencies\nNot shipped\n',
    'node_modules/rollup/package.json': {name: 'rollup', version: '1.0.0', license: 'MIT'}
  });

it('ships every licence file NOTICE cites', () => {
  const cited = citedLicenses(readFileSync(join(ROOT, 'NOTICE'), 'utf8'));
  expect(cited.length).toBeGreaterThan(0);
  expect(cited.filter(path => !PROGRAM_LICENSES.some(id => path === `LICENSES/${id}.txt`))).toEqual([]);
  expect(PROGRAM_LICENSES.filter(id => !existsSync(join(ROOT, 'LICENSES', `${id}.txt`)))).toEqual([]);
});

it('writes sorted notices of the production closure and lists packages without a licence file', () => {
  const root = checkout();
  const stage = tree({NOTICE: 'See LICENSES/CC-BY-3.0.txt.\n'});
  const {skipped} = stageNotices(stage, root);
  expect(skipped).toEqual([{name: 'nolicence', version: '0.0.1', license: 'MIT'}]);
  const rule = '='.repeat(72);
  expect(readFileSync(join(stage, NOTICES), 'utf8')).toBe(
    [
      `@scope/beta 1.0.0 (ISC) — COPYING\n${rule}\nBeta copying\n`,
      `rollup 4.0.0 (MIT) — LICENSE.md\n${rule}\nOnly the module namespace objects that Rollup writes into the build ship.\n\n# Rollup core license\nRollup MIT\n`,
      `vite 6.0.0 (MIT) — LICENSE.md\n${rule}\nOnly helper code that Vite writes into the build ships: the module preload polyfill, the preload helper for dynamic imports and the CommonJS interop helper of @rollup/plugin-commonjs, which Vite bundles.\n\n# Vite core license\nVite MIT\n\n## @rollup/plugin-alias, @rollup/plugin-commonjs\nLicense: MIT\n> Plugins MIT\n`,
      `zeta 2.0.0 (MIT) — LICENSE\n${rule}\nZeta\nlicence\n`,
      `Packages without a licence file\n${rule}\nnolicence 0.0.1 (MIT)\n`
    ].join('\n\n')
  );
  for (const id of PROGRAM_LICENSES) expect(readFileSync(join(stage, 'LICENSES', `${id}.txt`), 'utf8')).toBe(`${id}\n`);
  // A second run over the same tree gives the same bytes.
  const again = tree({NOTICE: 'See LICENSES/CC-BY-3.0.txt.\n'});
  stageNotices(again, root);
  expect(readFileSync(join(again, NOTICES))).toEqual(readFileSync(join(stage, NOTICES)));
});

it('fails when NOTICE cites a licence file the archive lacks', () => {
  const stage = tree({NOTICE: 'See LICENSES/CC-BY-3.0.txt and LICENSES/OFL-1.1.txt.\n'});
  expect(() => stageNotices(stage, checkout())).toThrow('NOTICE cites licence files the program archive lacks: LICENSES/OFL-1.1.txt');
});

it('checks every LICENSES/ path NOTICE cites, whatever its extension or depth', () => {
  const stage = tree({'LICENSES/CC-BY-3.0.txt': 'x', 'LICENSES/nested/.keep': '', NOTICE: ''});
  expect(citedLicenses('see LICENSES/CC-BY-3.0.txt. And (LICENSES/MIT.md), LICENSES/nested/MIT.txt; LICENSES/../NOTICE')).toEqual([
    'LICENSES/../NOTICE',
    'LICENSES/CC-BY-3.0.txt',
    'LICENSES/MIT.md',
    'LICENSES/nested/MIT.txt'
  ]);
  const notice = 'LICENSES/CC-BY-3.0.txt LICENSES/MIT.md LICENSES/nested/MIT.txt LICENSES/nested LICENSES/../NOTICE LICENSES/../../etc/passwd';
  expect(missingLicenses(notice, stage)).toEqual([
    'LICENSES/../../etc/passwd',
    'LICENSES/../NOTICE',
    'LICENSES/MIT.md',
    'LICENSES/nested',
    'LICENSES/nested/MIT.txt'
  ]);
});

it('fails when a build tool licence lacks a section the build ships', () => {
  const root = checkout();
  writeFileSync(join(root, 'node_modules/vite/LICENSE.md'), '# Vite core license\nVite MIT\n');
  expect(() => stageNotices(tree({NOTICE: ''}), root)).toThrow('vite/LICENSE.md has no section for @rollup/plugin-commonjs');
});
