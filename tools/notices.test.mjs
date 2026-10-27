import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterEach, expect, it} from 'vitest';
import {bundledPackagesPlugin, PACKAGE_LIST} from './bundled-packages.mjs';
import {citedLicenses, missingLicenses, NOTICES, PROGRAM_LICENSES, ROOT, splitCopyright, stageNotices} from './notices.mjs';

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
const MIT_TERMS = 'Permission is hereby granted, free of charge,\nto any person.\n\nTHE SOFTWARE IS PROVIDED "AS IS".\n';
// MIT texts that differ only in their copyright statements, wrapping and indentation share one entry; a title line
// is a difference of its own.
const mitPackages = [
  ['mit-a', `MIT License\n\nCopyright (c) 2020 Alice\n\n${MIT_TERMS}`],
  ['mit-b', `MIT License\n\nCopyright (C) 2021 by Bob\nand others\nCopyright 2022 Carol\n\n\n${MIT_TERMS.replace(',\n', ', ')}`],
  ['mit-c', `  MIT License\n\n© 2023 Dave\n\n${MIT_TERMS.replace(/^/gm, '  ')}`],
  ['mit-untitled', `Copyright (c) 2024 Erin\n\n${MIT_TERMS}`]
];
const checkout = () =>
  tree({
    ...licenses,
    'package.json': {name: 'app', dependencies: {zeta: '1', '@scope/beta': '1', ...Object.fromEntries(mitPackages.map(([name]) => [name, '1']))}},
    ...Object.fromEntries(
      mitPackages.flatMap(([name, text]) => [
        [`node_modules/${name}/package.json`, {name, version: '1.0.0', license: 'MIT'}],
        [`node_modules/${name}/LICENSE`, text]
      ])
    ),
    'node_modules/zeta/package.json': {name: 'zeta', version: '2.0.0', license: 'MIT', dependencies: {nolicence: '1'}},
    'node_modules/zeta/LICENSE': 'Zeta\r\nlicence\r\n',
    'node_modules/@scope/beta/package.json': {name: '@scope/beta', version: '1.0.0', license: {type: 'ISC'}, dependencies: {zeta: '2'}},
    'node_modules/@scope/beta/license.md': 'Beta licence\n',
    // Upper case sorts first, so COPYING wins over license.md.
    'node_modules/@scope/beta/COPYING': 'Beta copying\n',
    'node_modules/nolicence/package.json': {name: 'nolicence', version: '0.0.1', license: 'MIT'},
    'node_modules/@react-aria/optimize-locales-plugin/package.json': {
      name: '@react-aria/optimize-locales-plugin',
      version: '2.0.2',
      dependencies: {unplugin: '2'}
    },
    'node_modules/@react-aria/optimize-locales-plugin/LICENSE': 'Apache-2.0\nCopyright 2019 Adobe\n',
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

function packageList(root, names = ['zeta', '@scope/beta', 'nolicence', '@react-aria/optimize-locales-plugin', ...mitPackages.map(([name]) => name)]) {
  const list = join(root, 'bundled-packages.json');
  writeFileSync(
    list,
    JSON.stringify({
      root,
      packages: names.map(name => join(root, 'node_modules', name)),
      buildRuntime: ['vite', 'rollup', '@react-aria/optimize-locales-plugin']
    })
  );
  return list;
}

it('ships every licence file NOTICE cites', () => {
  const cited = citedLicenses(readFileSync(join(ROOT, 'NOTICE'), 'utf8'));
  expect(cited.length).toBeGreaterThan(0);
  expect(cited.filter(path => !PROGRAM_LICENSES.some(id => path === `LICENSES/${id}.txt`))).toEqual([]);
  expect(PROGRAM_LICENSES.filter(id => !existsSync(join(ROOT, 'LICENSES', `${id}.txt`)))).toEqual([]);
});

// The archive leaves out these texts, so NOTICE must link every Creative Commons licence it applies.
it.each([
  ['CC BY 3.0', 'https://creativecommons.org/licenses/by/3.0/legalcode'],
  ['CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/legalcode'],
  ['CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/legalcode']
])('NOTICE links %s by its URI', (name, uri) => {
  const notice = readFileSync(join(ROOT, 'NOTICE'), 'utf8');
  expect(notice).toContain(`licensed under ${name}:\n${uri}\n`);
  expect(PROGRAM_LICENSES.filter(id => id.startsWith('CC'))).toEqual([]);
});

it.each([
  ['MIT', 'MIT License\n\nCopyright (c) 2020 Alice\n\nTerms.\n', ['Copyright (c) 2020 Alice'], 'MIT License\n\nTerms.'],
  [
    'a statement to the end of its paragraph',
    'Copyright (C) 2021 by Bob\nand others\n© 2022 Carol\n\nTerms.',
    ['Copyright (C) 2021 by Bob', 'and others', '© 2022 Carol'],
    'Terms.'
  ],
  [
    'indented Apache appendix',
    '   Copyright 2019 Adobe\n\n   Licensed under the Apache License.',
    ['Copyright 2019 Adobe'],
    'Licensed under the Apache License.'
  ],
  [
    'licence text that mentions copyright',
    'Grant of Copyright License.\ncopyright license to reproduce\nCopyright Holder(s)\n(c) You must retain\nCopyright [yyyy] [name of copyright owner]',
    [],
    'Grant of Copyright License.\ncopyright license to reproduce\nCopyright Holder(s)\n(c) You must retain\nCopyright [yyyy] [name of copyright owner]'
  ]
])('splits the copyright statements from %s', (_, text, copyright, rest) => {
  expect(splitCopyright(text)).toMatchObject({copyright, text: rest});
});

it('writes sorted notices of the bundled packages and lists packages without a licence file', () => {
  const root = checkout();
  const stage = tree({NOTICE: 'See LICENSES/OFL-1.1.txt.\n'});
  const {packages, skipped} = stageNotices(stage, packageList(root), root);
  expect(skipped).toEqual([{name: 'nolicence', version: '0.0.1', license: 'MIT'}]);
  expect(packages.map(({name, version, license}) => [name, version, license])).toEqual([
    ['@react-aria/optimize-locales-plugin', '2.0.2', 'Apache-2.0'],
    ['@scope/beta', '1.0.0', 'ISC'],
    ['mit-a', '1.0.0', 'MIT'],
    ['mit-b', '1.0.0', 'MIT'],
    ['mit-c', '1.0.0', 'MIT'],
    ['mit-untitled', '1.0.0', 'MIT'],
    ['rollup', '4.0.0', 'MIT'],
    ['vite', '6.0.0', 'MIT'],
    ['zeta', '2.0.0', 'MIT']
  ]);
  const notices = readFileSync(join(stage, NOTICES), 'utf8');
  // Every package and every copyright statement still appears; the shared MIT terms appear once.
  for (const {name, version, license, file} of packages) expect(notices).toContain(`${name} ${version} (${license}) — ${file}`);
  for (const line of ['Copyright (c) 2020 Alice', 'Copyright (C) 2021 by Bob', 'and others', 'Copyright 2022 Carol', '© 2023 Dave', 'Copyright (c) 2024 Erin'])
    expect(notices).toContain(line);
  expect(notices.split('THE SOFTWARE IS PROVIDED').length - 1).toBe(2);
  expect(notices).toContain(
    [
      'Licence text shared by 3 packages (MIT)',
      '='.repeat(72),
      'mit-a 1.0.0 (MIT) — LICENSE',
      '    Copyright (c) 2020 Alice',
      'mit-b 1.0.0 (MIT) — LICENSE',
      '    Copyright (C) 2021 by Bob',
      '    and others',
      '    Copyright 2022 Carol',
      'mit-c 1.0.0 (MIT) — LICENSE',
      '    © 2023 Dave',
      '',
      `MIT License\n\n${MIT_TERMS}`
    ].join('\n')
  );
  // A text without a match keeps its own entry, unchanged.
  expect(notices).toContain(`mit-untitled 1.0.0 (MIT) — LICENSE\n${'='.repeat(72)}\nCopyright (c) 2024 Erin\n\n${MIT_TERMS}`);
  expect(notices).not.toContain('Not shipped');
  expect(notices).not.toContain('\r');
  // A second run over the same tree gives the same bytes.
  const again = tree({NOTICE: 'See LICENSES/OFL-1.1.txt.\n'});
  stageNotices(again, packageList(root), root);
  expect(readFileSync(join(again, NOTICES))).toEqual(readFileSync(join(stage, NOTICES)));
});

it('fails when NOTICE cites a licence file the archive lacks', () => {
  const stage = tree({NOTICE: 'See LICENSES/OFL-1.1.txt and LICENSES/LicenseRef-Missing.txt.\n'});
  expect(() => stageNotices(stage, packageList(checkout()))).toThrow('NOTICE cites licence files the program archive lacks: LICENSES/LicenseRef-Missing.txt');
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
  expect(() => stageNotices(tree({NOTICE: ''}), packageList(root), root)).toThrow('vite/LICENSE.md has no section for @rollup/plugin-commonjs');
});

it('reads only listed packages, including lite packages and shared root packages', () => {
  const root = checkout();
  const lite = tree({
    'node_modules/astryx/package.json': {name: 'astryx', version: '1.0.0', license: 'MIT'},
    'node_modules/astryx/LICENSE': 'Astryx licence'
  });
  const list = packageList(root, ['@scope/beta']);
  const manifest = JSON.parse(readFileSync(list, 'utf8'));
  manifest.packages.push(join(lite, 'node_modules/astryx'), join(lite, 'node_modules/astryx'));
  writeFileSync(list, JSON.stringify(manifest));
  const {packages, skipped} = stageNotices(tree({NOTICE: ''}), list, root);
  expect(packages.map(pkg => pkg.name)).toEqual(['@react-aria/optimize-locales-plugin', '@scope/beta', 'astryx', 'rollup', 'vite']);
  expect(skipped).toEqual([]);
});

it('fails on a missing or malformed package list instead of falling back to root dependencies', () => {
  const root = checkout();
  const stage = tree({NOTICE: ''});
  expect(() => stageNotices(stage, join(root, 'missing.json'), root)).toThrow();
  const list = packageList(root);
  writeFileSync(list, '{}');
  expect(() => stageNotices(stage, list, root)).toThrow('Invalid bundled package list');
});

it('uses lite build helpers without adding standard-only helpers or CommonJS licence sections', () => {
  const root = checkout();
  const lite = tree({
    'node_modules/vite/package.json': {name: 'vite', version: '8.0.0', license: 'MIT'},
    'node_modules/vite/LICENSE.md': '# Vite core license\nVite MIT\n',
    'node_modules/vite/node_modules/rolldown/package.json': {name: 'rolldown', version: '1.0.0', license: 'MIT'},
    'node_modules/vite/node_modules/rolldown/LICENSE': 'Rolldown MIT\n'
  });
  const list = packageList(root, []);
  writeFileSync(list, JSON.stringify({root: lite, packages: [], buildRuntime: ['vite', 'rolldown']}));
  const {packages} = stageNotices(tree({NOTICE: ''}), list, root);
  expect(packages.map(({name, version}) => [name, version])).toEqual([
    ['rolldown', '1.0.0'],
    ['vite', '8.0.0']
  ]);
  expect(packages[1].text).not.toContain('@rollup/plugin-commonjs');
});

it('records chunk and asset packages, resolves pnpm paths, and excludes unbundled dependencies', () => {
  const root = checkout();
  const nested = tree({'node_modules/.pnpm/pkg@2/node_modules/@scope/pkg/package.json': {name: '@scope/pkg', version: '2'}});
  const plugin = bundledPackagesPlugin(['vite', 'rollup']);
  plugin.configResolved({root});
  let manifest;
  plugin.generateBundle.call(
    {
      emitFile(asset) {
        expect(asset.fileName).toBe(PACKAGE_LIST);
        manifest = JSON.parse(asset.source);
      }
    },
    {},
    {
      'main.js': {
        type: 'chunk',
        modules: {
          [join(root, 'src/main.js')]: {},
          [join(root, 'node_modules/zeta/index.js')]: {},
          ['\0' + join(root, 'node_modules/zeta/index.js') + '?commonjs-proxy']: {},
          [join(nested, 'node_modules/.pnpm/pkg@2/node_modules/@scope/pkg/index.js')]: {}
        }
      },
      'font.woff2': {type: 'asset', originalFileNames: ['node_modules/@scope/beta/font.woff2']}
    }
  );
  expect(manifest).toEqual({
    root,
    buildRuntime: ['vite', 'rollup'],
    packages: [join(root, 'node_modules/zeta'), join(root, 'node_modules/@scope/beta'), join(nested, 'node_modules/.pnpm/pkg@2/node_modules/@scope/pkg')].sort()
  });
});
