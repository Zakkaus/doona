/** Usage: node tools/fetch-honk.mjs <out-dir> [--repo owner/name] --tag tag --doona-tag vVERSION [--api url] [--archive url] --commit sha; Node 22+; exits 0/1/2
 * for done/verification failure/usage. Downloads every honk-core build from the pinned debug pre-release, checks each file against the sha256
 * digest the GitHub API reports, checks that the release body, the release target and the source tag all name the pinned tag and commit,
 * verifies the embedded doona pins against its published release, downloads both sources, and writes HONK-SOURCE.txt.
 * GITHUB_TOKEN or GH_TOKEN, when set, authenticates the API calls.
 * Run after publishing the standalone doona release and a matching honk debug build. */
import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir, readdir, rename, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Readable, Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {pathToFileURL} from 'node:url';

export const SOURCE_NOTE = 'HONK-SOURCE.txt';
// honk's Cargo.toml declares the licence; LICENSE carries the GPL-3.0 text.
const LICENCE = 'GPL-3.0-only';
const usage = 'Usage: node tools/fetch-honk.mjs <out-dir> [--repo owner/name] --tag tag --doona-tag vVERSION [--api url] [--archive url] --commit sha';
const SHA = /^[0-9a-f]{40}$/;

// honk's release workflow builds each target twice: mimalloc by default, and the system allocator under -stock.
export function expectedAssets() {
  const names = [];
  for (const arch of ['x86_64', 'aarch64'])
    for (const libc of ['gnu', 'musl']) for (const allocator of ['', '-stock']) names.push(`honk-core-debug-${arch}-unknown-linux-${libc}${allocator}.tar.gz`);
  return names;
}

// The debug workflow writes the source tag, commit and run into the release body.
export function parseBody(body) {
  const field = pattern => (body ?? '').match(pattern)?.[1];
  const source = {tag: field(/^Source tag: `([^`\s]+)`\s*$/m), commit: field(/^Commit: `([0-9a-f]{40})`\s*$/m), build: field(/^Build: (https:\/\/\S+)\s*$/m)};
  const missing = Object.entries(source)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) throw new Error(`release body lacks ${missing.join(', ')}`);
  return source;
}

// GPL-3.0 section 6: the release carries the corresponding source beside the binaries rather than only pointing at it.
export const sourceArchive = commit => `honk-source-${commit}.tar.gz`;

export function sourceNote({repo, release, source, doona, files}) {
  const tree = `https://github.com/${repo}/tree/${source.commit}`;
  return [
    'honk-core builds bundled with this doona release',
    '',
    'doona ships these until honk publishes a release with the native API. They are',
    `unmodified copies of the ${release.tag_name} pre-release assets, checked against the`,
    'explicitly selected honk commit.',
    '',
    `Release: ${release.html_url}`,
    `Source tag: ${source.tag}`,
    `Commit: ${source.commit}`,
    `Build: ${source.build}`,
    `Licence: ${LICENCE}, https://github.com/${repo}/blob/${source.commit}/LICENSE`,
    `Corresponding source: ${tree}`,
    `Source archive: ${sourceArchive(source.commit)}, from https://github.com/${repo}/archive/${source.commit}.tar.gz`,
    '',
    `doona release: ${doona.release.html_url}`,
    `doona version: ${doona.version}`,
    `doona commit: ${doona.commit}`,
    `doona program SHA-256: ${doona.sha256}`,
    `doona pins: https://github.com/${repo}/blob/${source.commit}/.github/ci/pins.env`,
    `doona source: ${doona.asset.name}, from ${doona.asset.browser_download_url}`,
    '',
    'SHA-256:',
    ...files.map(({name, sha256}) => `${sha256}  ${name}`),
    ''
  ].join('\n');
}

async function download(url, path) {
  const response = await fetch(url, {redirect: 'follow', signal: AbortSignal.timeout(300_000)});
  if (!response.ok || !response.body) throw new Error(`GET ${url}: HTTP ${response.status}`);
  const hash = createHash('sha256');
  const tap = new Transform({
    transform(chunk, _encoding, done) {
      hash.update(chunk);
      done(null, chunk);
    }
  });
  await pipeline(Readable.fromWeb(response.body), tap, createWriteStream(path));
  return hash.digest('hex');
}

// The commit a tag points to, through an annotated tag's object when there is one.
async function tagCommit({api, repo, tag, headers}) {
  const read = async path => {
    const response = await fetch(`${api}/repos/${repo}/git/${path}`, {headers, signal: AbortSignal.timeout(60_000)});
    if (!response.ok) throw new Error(`GET source tag ${repo}@${tag}: HTTP ${response.status}`);
    return (await response.json()).object;
  };
  let object = await read(`ref/tags/${encodeURIComponent(tag)}`);
  while (object?.type === 'tag') object = await read(`tags/${object.sha}`);
  if (object?.type !== 'commit') throw new Error(`source tag ${tag} does not point to a commit`);
  return object.sha;
}

export async function fetchHonk({
  out,
  repo = 'Glassyiris/honk',
  tag,
  doonaTag,
  api = 'https://api.github.com',
  archive = 'https://github.com',
  commit,
  token,
  log = () => {}
}) {
  if (!tag?.startsWith('debug.')) throw new Error(`the pinned tag ${tag} is not a debug.* tag`);
  if (!SHA.test(commit ?? '')) throw new Error(`the pinned commit ${commit} is not a full commit SHA`);
  if (!/^v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(doonaTag ?? '')) throw new Error('a versioned --doona-tag is required');
  await mkdir(out, {recursive: true});
  if ((await readdir(out)).length) throw new Error('output directory must be empty');
  const headers = {accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28'};
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${api}/repos/${repo}/releases/tags/${tag}`, {headers, signal: AbortSignal.timeout(60_000)});
  if (!response.ok) throw new Error(`GET release ${repo}@${tag}: HTTP ${response.status}`);
  const release = await response.json();
  const source = parseBody(release.body);
  if (source.tag !== tag) throw new Error(`release body names source tag ${source.tag}, doona pins ${tag}`);
  if (source.commit !== commit) throw new Error(`release body names commit ${source.commit}, doona pins ${commit}`);
  // The source shipped must be the commit the builds came from. A release that targets a branch names no commit, and the
  // source tag the build ran on is checked either way.
  if (SHA.test(release.target_commitish ?? '') && release.target_commitish !== commit)
    throw new Error(`the release targets ${release.target_commitish}, doona pins ${commit}`);
  const tagged = await tagCommit({api, repo, tag: source.tag, headers});
  if (tagged !== commit) throw new Error(`source tag ${source.tag} points to ${tagged}, doona pins ${commit}`);

  const doonaRepo = 'Zakkaus/doona';
  const uiResponse = await fetch(`${api}/repos/${doonaRepo}/releases/tags/${doonaTag}`, {headers, signal: AbortSignal.timeout(60_000)});
  if (!uiResponse.ok) throw new Error(`GET doona release ${doonaTag}: HTTP ${uiResponse.status}`);
  const uiRelease = await uiResponse.json();
  if (uiRelease.draft || uiRelease.tag_name !== doonaTag) throw new Error('doona release must be published at the requested tag');
  const version = doonaTag.slice(1);
  const uiCommit = await tagCommit({api, repo: doonaRepo, tag: doonaTag, headers});
  if (!SHA.test(uiCommit ?? '')) throw new Error('doona tag has no full commit SHA');
  const uiAssets = [
    [uiRelease, `doona-${version}.tar.gz`],
    [release, `doona-source-${version}.tar.gz`]
  ].map(([owner, name]) => {
    const matches = (owner.assets ?? []).filter(asset => asset.name === name);
    if (matches.length !== 1) throw new Error(`doona release requires exactly one ${name}`);
    const digest = /^sha256:([0-9a-f]{64})$/.exec(matches[0].digest ?? '')?.[1];
    if (!digest) throw new Error(`${name}: the API reports no sha256 digest`);
    return {...matches[0], sha256: digest};
  });
  const pinsResponse = await fetch(`${api}/repos/${repo}/contents/.github/ci/pins.env?ref=${commit}`, {
    headers: {...headers, accept: 'application/vnd.github.raw+json'},
    signal: AbortSignal.timeout(60_000)
  });
  if (!pinsResponse.ok) throw new Error(`GET honk doona pins: HTTP ${pinsResponse.status}`);
  const pins = await pinsResponse.text();
  for (const [key, value] of Object.entries({DOONA_VERSION: version, DOONA_REVISION: uiCommit, DOONA_SHA256: uiAssets[0].sha256})) {
    const matches = [...pins.matchAll(new RegExp(`^${key}=(.*)$`, 'gm'))];
    if (matches.length !== 1) throw new Error(`honk pins require exactly one ${key}`);
    if (matches[0][1] !== value) throw new Error(`honk ${key} does not match doona ${doonaTag}`);
  }
  const doona = {release: uiRelease, version, commit: uiCommit, sha256: uiAssets[0].sha256, asset: uiAssets[1]};

  const expected = expectedAssets();
  const assets = new Map((release.assets ?? []).filter(asset => asset.name.startsWith('honk-core-')).map(asset => [asset.name, asset]));
  const missing = expected.filter(name => !assets.has(name));
  const unexpected = [...assets.keys()].filter(name => !expected.includes(name));
  if (missing.length) throw new Error(`release lacks ${missing.join(', ')}`);
  // A new variant changes what doona ships, so it needs a look before it goes out.
  if (unexpected.length) throw new Error(`release has unrecognised builds ${unexpected.join(', ')}`);

  // Only a complete file gets its final name; `expect` is the digest to check it against, when one is published.
  const save = async (url, name, expect) => {
    const partial = join(out, `${name}.part`);
    try {
      const actual = await download(url, partial);
      if (expect && actual !== expect) throw new Error(`${name}: sha256 ${actual}, the API reports ${expect}`);
      await rename(partial, join(out, name));
      return actual;
    } finally {
      await rm(partial, {force: true});
    }
  };
  const files = [];
  for (const name of expected) {
    const asset = assets.get(name);
    const digest = /^sha256:([0-9a-f]{64})$/.exec(asset.digest ?? '')?.[1];
    if (!digest) throw new Error(`${name}: the API reports no sha256 digest`);
    await save(asset.browser_download_url, name, digest);
    files.push({name, sha256: digest});
    log(`OK ${digest}  ${name}`);
  }
  // GitHub publishes no digest for a commit archive, so the copy downloaded here is the one SHA256SUMS vouches for.
  const name = sourceArchive(source.commit);
  files.push({name, sha256: await save(`${archive}/${repo}/archive/${source.commit}.tar.gz`, name)});
  log(`OK ${files.at(-1).sha256}  ${name}`);
  files.push({name: doona.asset.name, sha256: await save(doona.asset.browser_download_url, doona.asset.name, doona.asset.sha256)});
  const partial = join(out, `${SOURCE_NOTE}.part`);
  try {
    await writeFile(partial, sourceNote({repo, release, source, doona, files}));
    await rename(partial, join(out, SOURCE_NOTE));
  } finally {
    await rm(partial, {force: true});
  }
  log(`${source.tag} at ${source.commit}`);
  return {source, files};
}

export async function main(args) {
  const options = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) {
      positional.push(args[i]);
      continue;
    }
    if (!['--repo', '--tag', '--doona-tag', '--api', '--archive', '--commit'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) {
      console.error(usage);
      return 2;
    }
    options[args[i] === '--doona-tag' ? 'doonaTag' : args[i].slice(2)] = args[++i];
  }
  if (positional.length !== 1 || !options.tag || !options.commit || !options.doonaTag) {
    console.error(usage);
    return 2;
  }
  try {
    await fetchHonk({...options, out: positional[0], token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN, log: line => console.log(line)});
    return 0;
  } catch (error) {
    console.error(`fetch-honk: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
