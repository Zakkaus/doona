import {createHash} from 'node:crypto';
import {existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {expectedAssets, fetchHonk, main, parseBody, SOURCE_NOTE, sourceArchive} from './fetch-honk.mjs';

vi.mock('node:fs/promises', {spy: true});

const commit = '5d8f32c10fc01363cea33dcdb9b1c155e2449fa2';
const tag = 'debug.2026.9.26.native-api.4';
const body = [
  `Debug build of \`${tag}\`.`,
  '',
  `Source tag: \`${tag}\``,
  `Commit: \`${commit}\``,
  'Build: https://github.com/Glassyiris/honk/actions/runs/36241239721',
  ''
].join('\n');
const ref = `/repos/Glassyiris/honk/git/ref/tags/${tag}`;
const doonaTag = 'v0.1.0-beta.17';
const uiCommit = 'b'.repeat(40);
const uiSource = 'doona-source-0.1.0-beta.17.tar.gz';
const uiProgram = 'doona-0.1.0-beta.17.tar.gz';
const other = 'f'.repeat(40);
const dirs = [];
const sha256 = data => createHash('sha256').update(data).digest('hex');

// The fixture serves only the pins at the selected honk commit.
async function serve({
  edit = release => release,
  served = {},
  source = `source of ${commit}`,
  refs = {[ref]: {type: 'commit', sha: commit}},
  uiEdit = release => release,
  uiRefs = {},
  pins = `DOONA_VERSION=0.1.0-beta.17\nDOONA_REVISION=${uiCommit}\nDOONA_SHA256=${sha256('program')}\n`
} = {}) {
  const contents = {...Object.fromEntries(expectedAssets().map(name => [name, `tarball ${name}`])), [uiProgram]: 'program', [uiSource]: 'doona source'};
  refs = {...refs, [`/repos/Zakkaus/doona/git/ref/tags/${doonaTag}`]: {type: 'commit', sha: uiCommit}, ...uiRefs};
  const api = 'https://fixture.invalid';
  vi.stubGlobal('fetch', async url => {
    const path = url.slice(api.length);
    const assets = names => names.map(name => ({name, digest: `sha256:${sha256(contents[name])}`, browser_download_url: `${api}/download/${name}`}));
    if (path === `/repos/Glassyiris/honk/releases/tags/${tag}`)
      return Response.json(
        edit({
          tag_name: tag,
          html_url: `https://github.com/Glassyiris/honk/releases/tag/${tag}`,
          target_commitish: commit,
          body,
          assets: assets([...expectedAssets(), uiSource])
        })
      );
    if (path === `/repos/Zakkaus/doona/releases/tags/${doonaTag}`)
      return Response.json(
        uiEdit({tag_name: doonaTag, draft: false, html_url: `https://github.com/Zakkaus/doona/releases/tag/${doonaTag}`, assets: assets([uiProgram])})
      );
    if (path === `/repos/Glassyiris/honk/contents/.github/ci/pins.env?ref=${commit}` && pins !== null) return new Response(pins);
    if (path in refs) return Response.json({object: refs[path]});
    if (path === `/Glassyiris/honk/archive/${commit}.tar.gz` && source !== null) return new Response(source);
    const name = decodeURIComponent(path.replace(/^\/download\//, ''));
    return name in contents ? new Response(served[name] ?? contents[name]) : new Response(null, {status: 404});
  });
  const out = mkdtempSync(join(tmpdir(), 'fetch-honk-'));
  dirs.push(out);
  return {api, archive: api, out, contents, source};
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true});
  vi.unstubAllGlobals();
});

describe('parseBody', () => {
  it('reads the source tag, commit and run', () => {
    expect(parseBody(body)).toEqual({
      tag,
      commit,
      build: 'https://github.com/Glassyiris/honk/actions/runs/36241239721'
    });
  });

  it('names every field the body lacks', () => {
    expect(() => parseBody('Rolling debug build.')).toThrow('release body lacks tag, commit, build');
  });
});

describe('fetchHonk', () => {
  it('lists the eight builds', () => {
    expect(expectedAssets()).toHaveLength(8);
    expect(expectedAssets()).toContain('honk-core-debug-aarch64-unknown-linux-musl-stock.tar.gz');
  });

  it('downloads every build and the source archive, and writes the source note', async () => {
    const {api, archive, out, contents, source} = await serve();
    const {files} = await fetchHonk({doonaTag, tag, commit, api, archive, out});
    expect(files.map(file => file.name)).toEqual([...expectedAssets(), sourceArchive(commit), uiSource]);
    expect(readdirSync(out).sort()).toEqual([...expectedAssets(), sourceArchive(commit), uiSource, SOURCE_NOTE].sort());
    for (const name of expectedAssets()) expect(readFileSync(join(out, name), 'utf8')).toBe(contents[name]);
    expect(readFileSync(join(out, sourceArchive(commit)), 'utf8')).toBe(source);
    const note = readFileSync(join(out, SOURCE_NOTE), 'utf8');
    expect(note).toContain(`Source tag: ${tag}`);
    expect(note).toContain(`Corresponding source: https://github.com/Glassyiris/honk/tree/${commit}`);
    expect(note).toContain('Licence: GPL-3.0-only');
    expect(note).toContain(`doona version: ${doonaTag.slice(1)}`);
    expect(note).toContain(`doona commit: ${uiCommit}`);
    expect(note).toContain(`doona program SHA-256: ${sha256('program')}`);
    expect(note).toContain(`${sha256(contents[uiSource])}  ${uiSource}`);
    expect(readFileSync(join(out, uiSource), 'utf8')).toBe(contents[uiSource]);
    expect(note).toContain(`${sha256(contents[expectedAssets()[0]])}  ${expectedAssets()[0]}`);
    expect(note).toContain(`Source archive: honk-source-${commit}.tar.gz, from https://github.com/Glassyiris/honk/archive/${commit}.tar.gz`);
    expect(note).toContain(`${sha256(source)}  honk-source-${commit}.tar.gz`);
  });

  it('removes an incomplete note when writing it fails', async () => {
    const options = await serve();
    const write = vi.spyOn(fs, 'writeFile').mockImplementationOnce(async path => {
      writeFileSync(path, 'partial note');
      throw new Error('note write failed');
    });
    try {
      await expect(fetchHonk({doonaTag, tag, commit, ...options})).rejects.toThrow('note write failed');
      expect(existsSync(join(options.out, SOURCE_NOTE))).toBe(false);
      expect(existsSync(join(options.out, `${SOURCE_NOTE}.part`))).toBe(false);
    } finally {
      write.mockRestore();
    }
  });

  it('fails when the source archive is not found and writes no note', async () => {
    const {api, archive, out} = await serve({source: null});
    await expect(fetchHonk({doonaTag, tag, commit, api, archive, out})).rejects.toThrow('HTTP 404');
    expect(existsSync(join(out, sourceArchive(commit)))).toBe(false);
    expect(existsSync(join(out, `${sourceArchive(commit)}.part`))).toBe(false);
    expect(existsSync(join(out, SOURCE_NOTE))).toBe(false);
  });

  it('fails on a digest mismatch and keeps no partial file', async () => {
    const name = expectedAssets()[3];
    const {api, out} = await serve({served: {[name]: 'tampered'}});
    await expect(fetchHonk({doonaTag, tag, commit, api, out})).rejects.toThrow(`${name}: sha256 ${sha256('tampered')}`);
    expect(existsSync(join(out, name))).toBe(false);
    expect(existsSync(join(out, `${name}.part`))).toBe(false);
    expect(existsSync(join(out, SOURCE_NOTE))).toBe(false);
  });

  it('fails when a build is missing', async () => {
    const name = expectedAssets()[5];
    const {api, out} = await serve({edit: release => ({...release, assets: release.assets.filter(asset => asset.name !== name)})});
    await expect(fetchHonk({doonaTag, tag, commit, api, out})).rejects.toThrow(`release lacks ${name}`);
  });

  it('fails on a build it does not recognise', async () => {
    const extra = {name: 'honk-core-debug-riscv64gc-unknown-linux-gnu.tar.gz', digest: `sha256:${'0'.repeat(64)}`, browser_download_url: 'http://127.0.0.1:1/'};
    const {api, out} = await serve({edit: release => ({...release, assets: [...release.assets, extra]})});
    await expect(fetchHonk({doonaTag, tag, commit, api, out})).rejects.toThrow('unrecognised builds honk-core-debug-riscv64gc-unknown-linux-gnu.tar.gz');
  });

  it('fails when an asset carries no digest', async () => {
    const {api, out} = await serve({edit: release => ({...release, assets: release.assets.map(({digest: _digest, ...asset}) => asset)})});
    await expect(fetchHonk({doonaTag, tag, commit, api, out})).rejects.toThrow('the API reports no sha256 digest');
  });

  describe('against the pinned commit', () => {
    it('passes when the body, the release target and the source tag all name it', async () => {
      const {api, archive, out} = await serve();
      const {source} = await fetchHonk({doonaTag, tag, commit, api, archive, out});
      expect(source.commit).toBe(commit);
      expect(readFileSync(join(out, SOURCE_NOTE), 'utf8')).toContain(`Commit: ${commit}\n`);
    });

    it('fails when the release names another commit', async () => {
      const {api, out} = await serve();
      await expect(fetchHonk({doonaTag, tag, commit: other, api, out})).rejects.toThrow(`release body names commit ${commit}, doona pins ${other}`);
      expect(readdirSync(out)).toEqual([]);
    });

    it('fails when the release body names another source tag', async () => {
      const {api, out} = await serve({
        edit: release => ({...release, body: body.replace(`Source tag: \`${tag}\``, 'Source tag: `debug.2026.9.26.native-api.3`')})
      });
      await expect(fetchHonk({doonaTag, tag, commit, api, out})).rejects.toThrow(
        `release body names source tag debug.2026.9.26.native-api.3, doona pins ${tag}`
      );
      expect(readdirSync(out)).toEqual([]);
    });

    it('fails when the release body has no Commit line', async () => {
      const {api, out} = await serve({edit: release => ({...release, body: body.replace(/^Commit: .*$/m, '')})});
      await expect(fetchHonk({doonaTag, tag, commit, api, out})).rejects.toThrow('release body lacks commit');
    });

    it('fails when the release targets another commit', async () => {
      const {api, out} = await serve({edit: release => ({...release, target_commitish: other})});
      await expect(fetchHonk({doonaTag, tag, commit, api, out})).rejects.toThrow(`the release targets ${other}, doona pins ${commit}`);
    });

    it('checks the source tag even when the release targets the commit', async () => {
      const {api, out} = await serve({refs: {[ref]: {type: 'commit', sha: other}}});
      await expect(fetchHonk({doonaTag, tag, commit, api, out})).rejects.toThrow(`source tag ${tag} points to ${other}, doona pins ${commit}`);
    });

    it('refuses a pin that is not a full SHA', async () => {
      await expect(fetchHonk({doonaTag, tag, commit: commit.slice(0, 8), out: 'unused'})).rejects.toThrow('is not a full commit SHA');
    });

    it('refuses a pin that is not a debug tag', async () => {
      await expect(fetchHonk({doonaTag, tag: 'debug', commit, out: 'unused'})).rejects.toThrow('the pinned tag debug is not a debug.* tag');
      await expect(fetchHonk({doonaTag, commit, out: 'unused'})).rejects.toThrow('is not a debug.* tag');
    });
  });

  describe('with a release that targets a branch', () => {
    const branch = {edit: release => ({...release, target_commitish: 'main'})};

    it('checks the pinned commit through the source tag', async () => {
      const {api, archive, out} = await serve({...branch, refs: {[ref]: {type: 'commit', sha: commit}}});
      const {source} = await fetchHonk({doonaTag, tag, commit, api, archive, out});
      expect(source.commit).toBe(commit);
    });

    it('follows an annotated source tag to its commit', async () => {
      const annotated = 'a'.repeat(40);
      const refs = {[ref]: {type: 'tag', sha: annotated}, [`/repos/Glassyiris/honk/git/tags/${annotated}`]: {type: 'commit', sha: commit}};
      const {api, archive, out} = await serve({...branch, refs});
      await expect(fetchHonk({doonaTag, tag, commit, api, archive, out})).resolves.toMatchObject({source: {commit}});
    });

    it('fails when the source tag points elsewhere', async () => {
      const {api, out} = await serve({...branch, refs: {[ref]: {type: 'commit', sha: other}}});
      await expect(fetchHonk({doonaTag, tag, commit, api, out})).rejects.toThrow(`source tag ${tag} points to ${other}, doona pins ${commit}`);
      expect(existsSync(join(out, SOURCE_NOTE))).toBe(false);
    });

    it('fails when the source tag cannot be read', async () => {
      const {api, out} = await serve({...branch, refs: {}});
      await expect(fetchHonk({doonaTag, tag, commit, api, out})).rejects.toThrow(`GET source tag Glassyiris/honk@${tag}: HTTP 404`);
      expect(readdirSync(out)).toEqual([]);
    });
  });

  const pins = {DOONA_VERSION: doonaTag.slice(1), DOONA_REVISION: uiCommit, DOONA_SHA256: sha256('program')};
  const pinText = entries => entries.map(([key, value]) => `${key}=${value}`).join('\n');
  it.each(Object.keys(pins).flatMap(key => ['stale', 'missing', 'duplicate'].map(kind => [key, kind])))(
    'rejects %s when %s and writes no complete note',
    async (key, kind) => {
      const entries = Object.entries(pins);
      const changed =
        kind === 'missing'
          ? entries.filter(([name]) => name !== key)
          : kind === 'duplicate'
            ? [...entries, [key, pins[key]]]
            : entries.map(([name, value]) => [
                name,
                name === key ? {DOONA_VERSION: '0.1.0-beta.16', DOONA_REVISION: other, DOONA_SHA256: 'f'.repeat(64)}[key] : value
              ]);
      const options = await serve({pins: pinText(changed)});
      await expect(fetchHonk({doonaTag, tag, commit, ...options})).rejects.toThrow(key);
      expect(existsSync(join(options.out, SOURCE_NOTE))).toBe(false);
    }
  );

  it.each([
    ['missing source', {edit: release => ({...release, assets: release.assets.filter(asset => asset.name !== uiSource)})}, 'exactly one'],
    [
      'missing source digest',
      {edit: release => ({...release, assets: release.assets.map(asset => (asset.name === uiSource ? {...asset, digest: null} : asset))})},
      'no sha256'
    ],
    ['source digest mismatch', {served: {[uiSource]: 'tampered'}}, 'sha256'],
    ['missing pins', {pins: null}, 'HTTP 404'],
    ['draft release', {uiEdit: release => ({...release, draft: true})}, 'must be published'],
    ['wrong release tag', {uiEdit: release => ({...release, tag_name: 'v0.1.0-beta.16'})}, 'requested tag']
  ])('rejects %s and writes no complete note', async (_, fixture, error) => {
    const options = await serve(fixture);
    await expect(fetchHonk({doonaTag, tag, commit, ...options})).rejects.toThrow(error);
    expect(existsSync(join(options.out, SOURCE_NOTE))).toBe(false);
    expect(readdirSync(options.out).some(name => name.endsWith('.part'))).toBe(false);
  });

  it('peels the published doona tag instead of using the checkout revision', async () => {
    const annotated = 'c'.repeat(40);
    const options = await serve({
      uiRefs: {
        [`/repos/Zakkaus/doona/git/ref/tags/${doonaTag}`]: {type: 'tag', sha: annotated},
        [`/repos/Zakkaus/doona/git/tags/${annotated}`]: {type: 'commit', sha: uiCommit}
      }
    });
    await expect(fetchHonk({doonaTag, tag, commit, ...options})).resolves.toBeDefined();
  });

  it('rejects nonempty staging without replacing an existing note', async () => {
    const options = await serve();
    const note = join(options.out, SOURCE_NOTE);
    writeFileSync(note, 'old note');
    await expect(fetchHonk({doonaTag, tag, commit, ...options})).rejects.toThrow('output directory must be empty');
    expect(readFileSync(note, 'utf8')).toBe('old note');
    expect(readdirSync(options.out)).toEqual([SOURCE_NOTE]);
  });

  it.each(['--tag', '--commit', '--doona-tag'])('requires explicit %s at the CLI', async option => {
    const args = [
      'unused',
      ...Object.entries({'--tag': tag, '--commit': commit, '--doona-tag': doonaTag})
        .filter(([key]) => key !== option)
        .flat()
    ];
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await main(args)).toBe(2);
    } finally {
      error.mockRestore();
    }
  });

  it('fails when a download is not found', async () => {
    const {api, out} = await serve({
      edit: release => ({
        ...release,
        assets: release.assets.map(asset => ({...asset, browser_download_url: asset.browser_download_url.replace('/download/', '/gone/')}))
      })
    });
    await expect(fetchHonk({doonaTag, tag, commit, api, out})).rejects.toThrow('HTTP 404');
  });
});
