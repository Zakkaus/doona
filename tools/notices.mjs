// Stages the licence texts and third-party notices of the program archive. tools/package.sh runs it on the staged
// program directory after copying LICENSE and NOTICE there.
import {copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const NOTICES = 'THIRD-PARTY-NOTICES.txt';
// Licence texts the program archive ships, besides GPL-3.0-only in LICENSE. OFL-1.1 also travels in the font archive
// as fonts/OFL.txt. NOTICE cites the Creative Commons licences of the palette images and flag artwork by URI, which
// the licences allow, and CC0-1.0 requires no notice; their texts and GPL-2.0-only stay in the repository for REUSE.
export const PROGRAM_LICENSES = ['OFL-1.1', 'Apache-2.0', 'LicenseRef-GitHub-Logos'];

// Build tools that write code of their own into dist/. Include only the shipped helpers' licence texts,
// not the tools' build-only dependency closure.
export const BUILD_RUNTIME = [
  {
    name: 'vite',
    from: [],
    sections: ['Vite core license', '@rollup/plugin-commonjs'],
    note: 'Only helper code that Vite writes into the build ships: the module preload polyfill, the preload helper for dynamic imports and the CommonJS interop helper of @rollup/plugin-commonjs, which Vite bundles.'
  },
  {
    name: 'rollup',
    from: ['vite'],
    sections: ['Rollup core license'],
    note: 'Only the module namespace objects that Rollup writes into the build ship.'
  },
  {
    name: '@react-aria/optimize-locales-plugin',
    from: [],
    file: 'LICENSE',
    license: 'Apache-2.0',
    note: 'Only the empty.js locale helper emitted by the plugin ships.'
  }
];

const LICENSE_FILE = /^(licen[cs]e|copying)(\..*)?$/i;

// Every LICENSES/ path NOTICE cites, whatever its depth or extension, without trailing punctuation; sorted.
export const citedLicenses = notice => [...new Set((notice.match(/LICENSES\/\S+/g) ?? []).map(path => path.replace(/[.,;:!?)\]}>'"]+$/, '')))].sort();

// Cited paths that are not a regular file inside stage/LICENSES.
export const missingLicenses = (notice, stage) =>
  citedLicenses(notice).filter(path => {
    const target = resolve(stage, path);
    if (relative(join(stage, 'LICENSES'), target).split(sep)[0] === '..') return true;
    return !existsSync(target) || !statSync(target).isFile();
  });

// A licence written as the old `{type}` object or `licenses` array is still a licence.
function licenseId(meta) {
  const id = license => (typeof license === 'string' ? license : license?.type);
  if (meta.license) return id(meta.license) ?? 'UNKNOWN';
  if (Array.isArray(meta.licenses) && meta.licenses.length) return meta.licenses.map(id).join(' OR ');
  return 'UNKNOWN';
}

// Node's lookup: the nearest node_modules/<name> from start upwards, followed through pnpm's links.
function resolvePackage(start, name) {
  for (let directory = start; ; directory = dirname(directory)) {
    const candidate = join(directory, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    if (dirname(directory) === directory) throw new Error(`Cannot resolve ${name} from ${start}`);
  }
}

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const byNameVersion = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.version < b.version ? -1 : a.version > b.version ? 1 : 0);

// Walks the production dependency closure of the package at root. Packages without a licence file are returned in
// `skipped` rather than failing the release.
export function dependencyLicenses(root = ROOT) {
  const checkout = realpathSync(root);
  const pending = Object.keys(readJson(join(checkout, 'package.json')).dependencies ?? {}).map(name => [checkout, name]);
  const seen = new Set();
  const packages = new Map();
  const skipped = new Map();
  while (pending.length) {
    const [start, name] = pending.pop();
    const directory = resolvePackage(start, name);
    if (seen.has(directory)) continue;
    seen.add(directory);
    const meta = readJson(join(directory, 'package.json'));
    const key = `${meta.name}@${meta.version}`;
    const entry = {name: meta.name, version: meta.version, license: licenseId(meta)};
    pending.push(...Object.keys(meta.dependencies ?? {}).map(dep => [directory, dep]));
    // The Noto font name tables credit Adobe, unlike the packages' generic Google licence header.
    const noto = ['@fontsource-variable/noto-sans-tc', '@fontsource-variable/noto-sans-sc'].includes(meta.name);
    const file = noto
      ? 'LICENSES/OFL-1.1.txt'
      : readdirSync(directory)
          .filter(name => LICENSE_FILE.test(name))
          .sort()[0];
    if (!file) {
      skipped.set(key, entry);
      continue;
    }
    // Normalise line endings so a checkout's settings cannot change the archive.
    const text = readFileSync(join(noto ? checkout : directory, file), 'utf8').replace(/\r\n?/g, '\n');
    packages.set(key, {...entry, file, text});
  }
  return {packages: [...packages.values()].sort(byNameVersion), skipped: [...skipped.values()].sort(byNameVersion)};
}

// The named sections of a bundler-style LICENSE.md, each from its heading to the next heading, without the rule that
// separates entries. Fails when a section is missing so a tool update cannot drop a notice silently.
export function licenseSections(text, names, source) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const heading = line => /^#{1,6} /.exec(line) && line.replace(/^#+ /, '').trim();
  return names
    .map(name => {
      const start = lines.findIndex(line => {
        const title = heading(line);
        return title && (title === name || title.split(', ').includes(name));
      });
      if (start < 0) throw new Error(`${source} has no section for ${name}`);
      let end = start + 1;
      while (end < lines.length && !heading(lines[end])) end++;
      return lines
        .slice(start, end)
        .join('\n')
        .replace(/\s*\n-{3,}\s*$/, '')
        .trimEnd();
    })
    .join('\n\n');
}

// BUILD_RUNTIME resolved against the installed build tools.
export function buildRuntimeLicenses(root = ROOT) {
  const checkout = realpathSync(root);
  return BUILD_RUNTIME.map(({name, from, sections, note, file = 'LICENSE.md', license}) => {
    const directory = resolvePackage(
      from.reduce((start, parent) => resolvePackage(start, parent), checkout),
      name
    );
    const meta = readJson(join(directory, 'package.json'));
    const source = readFileSync(join(directory, file), 'utf8').replace(/\r\n?/g, '\n');
    const text = sections ? licenseSections(source, sections, `${name}/${file}`) : source;
    return {name: meta.name, version: meta.version, license: license ?? licenseId(meta), file, text: `${note}\n\n${text}\n`};
  });
}

// A line that opens a copyright statement: "Copyright" followed by (c), © or a year, or (c) or © followed by a year.
// "copyright license", "Copyright Holder(s)" and Apache's "Copyright [yyyy]" template are licence text.
const COPYRIGHT = /^\s*(?:copyright\s*(?:\(c\)|©|\d)|(?:\(c\)|©)\s*\d)/i;

// Splits a licence text into its copyright statements, each running from a copyright line to the end of its
// paragraph, and the remaining text. `key` compares the remaining text regardless of wrapping and indentation.
export function splitCopyright(text) {
  const copyright = [];
  const rest = [];
  let statement = false;
  for (const line of text.split('\n')) {
    if (COPYRIGHT.test(line)) statement = true;
    else if (!line.trim()) statement = false;
    (statement ? copyright : rest).push(line);
  }
  const remaining = rest
    .join('\n')
    .replace(/\n\s*\n(\s*\n)+/g, '\n\n')
    .trim();
  const key = remaining
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim().replace(/\s+/g, ' '))
    .join('\n\n');
  return {copyright: copyright.map(line => line.trim()), text: remaining, key};
}

// Packages whose licence texts match apart from their copyright statements share one entry: every package with its
// copyright statements, then the text once. A package whose text matches no other keeps its text unchanged.
export function formatNotices({packages, skipped}) {
  const rule = '='.repeat(72);
  const heading = ({name, version, license, file}) => `${name} ${version} (${license}) — ${file}`;
  const groups = new Map();
  for (const pkg of packages) {
    const {copyright, text, key} = splitCopyright(pkg.text);
    if (!groups.has(key)) groups.set(key, {text, members: []});
    groups.get(key).members.push({...pkg, copyright});
  }
  const entries = [...groups.values()].map(({text, members}) => {
    if (members.length === 1) return `${heading(members[0])}\n${rule}\n${members[0].text}`;
    const licenses = [...new Set(members.map(({license}) => license))].join(', ');
    const list = members.map(member => [heading(member), ...member.copyright.map(line => `    ${line}`)].join('\n')).join('\n');
    return `Licence text shared by ${members.length} packages (${licenses})\n${rule}\n${list}\n\n${text}\n`;
  });
  if (skipped.length) {
    const list = skipped.map(({name, version, license}) => `${name} ${version} (${license})\n`).join('');
    entries.push(`Packages without a licence file\n${'='.repeat(72)}\n${list}`);
  }
  return entries.join('\n\n');
}

// Copies PROGRAM_LICENSES into stage/LICENSES, fails when NOTICE cites a licence file the stage lacks, and writes
// the notices of the production dependencies and of the build tools' runtime helpers.
export function stageNotices(stage, root = ROOT) {
  mkdirSync(join(stage, 'LICENSES'), {recursive: true});
  for (const id of PROGRAM_LICENSES) copyFileSync(join(root, 'LICENSES', `${id}.txt`), join(stage, 'LICENSES', `${id}.txt`));
  const missing = missingLicenses(readFileSync(join(stage, 'NOTICE'), 'utf8'), stage);
  if (missing.length) throw new Error(`NOTICE cites licence files the program archive lacks: ${missing.join(', ')}`);
  const {packages, skipped} = dependencyLicenses(root);
  const licenses = {packages: [...packages, ...buildRuntimeLicenses(root)].sort(byNameVersion), skipped};
  writeFileSync(join(stage, NOTICES), formatNotices(licenses));
  return licenses;
}

export function main(args) {
  if (args.length !== 1) {
    console.error('Usage: node tools/notices.mjs STAGE');
    return 1;
  }
  const {packages, skipped} = stageNotices(resolve(args[0]));
  for (const {name, version} of skipped) console.error(`No licence file, listed by name only: ${name} ${version}`);
  console.log(`${NOTICES}: ${packages.length} packages with licence texts, ${skipped.length} without`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
