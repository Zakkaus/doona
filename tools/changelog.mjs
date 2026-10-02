import {execFileSync} from 'node:child_process';
import {readFileSync, readdirSync, unlinkSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const types = ['Added', 'Changed', 'Fixed', 'Removed', 'Security', 'Internal'];
export const fragmentNote = 'Entries live in [changes/](changes/) until release.';
const command = (program, args, cwd) => execFileSync(program, args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000});

export function parseFragment(text, file) {
  const [type, ...body] = text.trim().split(/\r?\n/);
  const bullets = body.filter(line => line.trim());
  if (!types.includes(type) || !bullets.length || bullets.some(line => !/^- \S/.test(line))) {
    throw new Error(`${file}: expected a changelog type followed by one or more '- ' bullet lines`);
  }
  return {type, bullets};
}

export function render(root = process.cwd(), run = command, warn = console.warn) {
  const files = readdirSync(join(root, 'changes'))
    .filter(file => file.endsWith('.md') && file !== 'README.md')
    .sort();
  const fragments = files.map(file => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(file)) throw new Error(`${file}: use a lowercase branch slug`);
    return {file: `changes/${file}`, ...parseFragment(readFileSync(join(root, 'changes', file), 'utf8'), file)};
  });
  const groups = new Map(types.map(type => [type, []]));
  for (const {file, type, bullets} of fragments) {
    let suffix = '';
    try {
      const sha = run('git', ['log', '--diff-filter=A', '--format=%H', '-1', '--', file], root).trim();
      if (!/^[a-f0-9]{40,64}$/.test(sha)) throw new Error('no commit adding this fragment in local history');
      const pulls = JSON.parse(run('gh', ['api', `repos/{owner}/{repo}/commits/${sha}/pulls`], root));
      const pr = pulls.find(pr => pr.merged_at) ?? pulls[0];
      if (!Number.isSafeInteger(pr?.number) || pr.number < 1) throw new Error('no associated PR found');
      suffix = ` (#${pr.number})`;
    } catch (error) {
      warn(`changelog: ${file}: omitting PR number: ${error.message}`);
    }
    groups.get(type).push(...bullets.map(line => `${line.trimEnd()}${suffix}`));
  }
  const sections = types.filter(type => groups.get(type).length).map(type => `### ${type}\n\n${groups.get(type).join('\n')}`);
  return {section: ['## [Unreleased]', ...sections].join('\n\n') + '\n', files: fragments.map(fragment => fragment.file)};
}

export function release(version, date, root = process.cwd(), run = command, warn = console.warn) {
  const number = '(?:0|[1-9]\\d*)';
  const identifier = '(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)';
  const semver = new RegExp(`^${number}\\.${number}\\.${number}(?:-${identifier}(?:\\.${identifier})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`);
  if (!semver.test(version ?? '')) throw new Error('release requires a SemVer version without a leading v');
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
    throw new Error('release requires a valid YYYY-MM-DD date');
  }
  const path = join(root, 'CHANGELOG.md');
  const changelog = readFileSync(path, 'utf8');
  if (changelog.includes(`## [${version}]`)) throw new Error(`version ${version} is already in CHANGELOG.md`);
  const unreleased = /^## \[Unreleased\]\n([\s\S]*?)(?=^## \[)/m.exec(changelog);
  if (!unreleased) throw new Error('CHANGELOG.md has no Unreleased section');
  if (![fragmentNote, ''].includes(unreleased[1].trim())) throw new Error('release handwritten Unreleased entries before collecting fragments');
  const link = /^\[Unreleased\]: (https:\/\/[^\s]+\/compare\/)([^\s]+)\.\.\.HEAD$/m.exec(changelog);
  if (!link) throw new Error('CHANGELOG.md has no Unreleased comparison link');
  const {section, files} = render(root, run, warn);
  if (!files.length) throw new Error('no changelog fragments to release');
  const released = section.replace('## [Unreleased]', `## [${version}] - ${date}`);
  const next = changelog
    .replace(unreleased[0], () => `## [Unreleased]\n\n${fragmentNote}\n\n${released}\n`)
    .replace(link[0], `[Unreleased]: ${link[1]}v${version}...HEAD\n[${version}]: ${link[1]}${link[2]}...v${version}`);
  writeFileSync(path, next);
  for (const file of files) unlinkSync(join(root, file));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [action, ...args] = process.argv.slice(2);
  try {
    if (action === 'render' && !args.length) process.stdout.write(render().section);
    else if (action === 'release' && args.length === 2) release(...args);
    else throw new Error('usage: node tools/changelog.mjs render | release <version> <date>');
  } catch (error) {
    console.error(`changelog: ${error.message}`);
    process.exitCode = 1;
  }
}
