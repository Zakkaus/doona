import {createHash} from 'node:crypto';
import {existsSync, mkdtempSync, readdirSync, readFileSync, rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {closeServers} from './close-servers.mjs';
import {expectedAssets, fetchHonk, parseBody, PIN_FILE, readPin, SOURCE_NOTE, sourceArchive} from './fetch-honk.mjs';

const commit = '5d8f32c10fc01363cea33dcdb9b1c155e2449fa2';
const body = [
  'Rolling debug build; replaced by subsequent successful debug-tag runs.',
  '',
  'Source tag: `debug.2026.9.26.native-api.4`',
  `Commit: \`${commit}\``,
  'Build: https://github.com/Glassyiris/honk/actions/runs/36241239721',
  ''
].join('\n');
const ref = '/repos/Glassyiris/honk/git/ref/tags/debug.2026.9.26.native-api.4';
const other = 'f'.repeat(40);
const servers = [];
const dirs = [];
const sha256 = data => createHash('sha256').update(data).digest('hex');

// A GitHub stand-in for the release API, its downloads and commit archives: `edit` adjusts the release JSON, `served` the bytes
// behind one asset name, `source` the archive of the commit (null answers 404), and `refs` the git objects by API path. The source
// tag points to the commit unless `refs` says otherwise.
async function serve({edit = release => release, served = {}, source = `source of ${commit}`, refs = {[ref]: {type: 'commit', sha: commit}}} = {}) {
  const contents = Object.fromEntries(expectedAssets().map(name => [name, `tarball ${name}`]));
  const server = createServer((request, response) => {
    const {port} = server.address();
    if (request.url === '/repos/Glassyiris/honk/releases/tags/debug') {
      const assets = expectedAssets().map(name => ({
        name,
        digest: `sha256:${sha256(contents[name])}`,
        browser_download_url: `http://127.0.0.1:${port}/download/${name}`
      }));
      const release = edit({tag_name: 'debug', html_url: 'https://github.com/Glassyiris/honk/releases/tag/debug', target_commitish: commit, body, assets});
      response.writeHead(200, {'content-type': 'application/json'});
      response.end(JSON.stringify(release));
      return;
    }
    if (request.url in refs) {
      response.writeHead(200, {'content-type': 'application/json'});
      response.end(JSON.stringify({object: refs[request.url]}));
      return;
    }
    if (request.url === `/Glassyiris/honk/archive/${commit}.tar.gz` && source !== null) {
      response.writeHead(200, {'content-type': 'application/gzip'});
      response.end(source);
      return;
    }
    const name = decodeURIComponent(request.url.replace(/^\/download\//, ''));
    if (!(name in contents)) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {'content-type': 'application/octet-stream'});
    response.end(served[name] ?? contents[name]);
  });
  servers.push(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const out = mkdtempSync(join(tmpdir(), 'fetch-honk-'));
  dirs.push(out);
  const api = `http://127.0.0.1:${server.address().port}`;
  return {api, archive: api, out, contents, source};
}

afterEach(async () => {
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true});
  await closeServers(servers);
});

describe('parseBody', () => {
  it('reads the source tag, commit and run', () => {
    expect(parseBody(body)).toEqual({
      tag: 'debug.2026.9.26.native-api.4',
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
    const {files} = await fetchHonk({commit, api, archive, out});
    expect(files.map(file => file.name)).toEqual([...expectedAssets(), sourceArchive(commit)]);
    expect(readdirSync(out).sort()).toEqual([...expectedAssets(), sourceArchive(commit), SOURCE_NOTE].sort());
    for (const name of expectedAssets()) expect(readFileSync(join(out, name), 'utf8')).toBe(contents[name]);
    expect(readFileSync(join(out, sourceArchive(commit)), 'utf8')).toBe(source);
    const note = readFileSync(join(out, SOURCE_NOTE), 'utf8');
    expect(note).toContain('Source tag: debug.2026.9.26.native-api.4');
    expect(note).toContain(`Corresponding source: https://github.com/Glassyiris/honk/tree/${commit}`);
    expect(note).toContain('Licence: GPL-3.0-only');
    expect(note).toContain(`${sha256(contents[expectedAssets()[0]])}  ${expectedAssets()[0]}`);
    expect(note).toContain(`Source archive: honk-source-${commit}.tar.gz, from https://github.com/Glassyiris/honk/archive/${commit}.tar.gz`);
    expect(note).toContain(`${sha256(source)}  honk-source-${commit}.tar.gz`);
  });

  it('fails when the source archive is not found and writes no note', async () => {
    const {api, archive, out} = await serve({source: null});
    await expect(fetchHonk({commit, api, archive, out})).rejects.toThrow('HTTP 404');
    expect(existsSync(join(out, sourceArchive(commit)))).toBe(false);
    expect(existsSync(join(out, `${sourceArchive(commit)}.part`))).toBe(false);
    expect(existsSync(join(out, SOURCE_NOTE))).toBe(false);
  });

  it('fails on a digest mismatch and keeps no partial file', async () => {
    const name = expectedAssets()[3];
    const {api, out} = await serve({served: {[name]: 'tampered'}});
    await expect(fetchHonk({commit, api, out})).rejects.toThrow(`${name}: sha256 ${sha256('tampered')}`);
    expect(existsSync(join(out, name))).toBe(false);
    expect(existsSync(join(out, `${name}.part`))).toBe(false);
    expect(existsSync(join(out, SOURCE_NOTE))).toBe(false);
  });

  it('fails when a build is missing', async () => {
    const name = expectedAssets()[5];
    const {api, out} = await serve({edit: release => ({...release, assets: release.assets.filter(asset => asset.name !== name)})});
    await expect(fetchHonk({commit, api, out})).rejects.toThrow(`release lacks ${name}`);
  });

  it('fails on a build it does not recognise', async () => {
    const extra = {name: 'honk-core-debug-riscv64gc-unknown-linux-gnu.tar.gz', digest: `sha256:${'0'.repeat(64)}`, browser_download_url: 'http://127.0.0.1:1/'};
    const {api, out} = await serve({edit: release => ({...release, assets: [...release.assets, extra]})});
    await expect(fetchHonk({commit, api, out})).rejects.toThrow('unrecognised builds honk-core-debug-riscv64gc-unknown-linux-gnu.tar.gz');
  });

  it('fails when an asset carries no digest', async () => {
    const {api, out} = await serve({edit: release => ({...release, assets: release.assets.map(({digest: _digest, ...asset}) => asset)})});
    await expect(fetchHonk({commit, api, out})).rejects.toThrow('the API reports no sha256 digest');
  });

  describe('against the pinned commit', () => {
    it('passes when the body, the release target and the source tag all name it', async () => {
      const {api, archive, out} = await serve();
      const {source} = await fetchHonk({commit, api, archive, out});
      expect(source.commit).toBe(commit);
      expect(readFileSync(join(out, SOURCE_NOTE), 'utf8')).toContain(`Commit: ${commit}\n`);
    });

    it('fails when the debug release has moved to another commit', async () => {
      const {api, out} = await serve();
      await expect(fetchHonk({commit: other, api, out})).rejects.toThrow(
        `release body names commit ${commit}, doona pins ${other}; update tools/honk-commit.txt`
      );
      expect(readdirSync(out)).toEqual([]);
    });

    it('fails when the release body has no Commit line', async () => {
      const {api, out} = await serve({edit: release => ({...release, body: body.replace(/^Commit: .*$/m, '')})});
      await expect(fetchHonk({commit, api, out})).rejects.toThrow('release body lacks commit');
    });

    it('fails when the release targets another commit', async () => {
      const {api, out} = await serve({edit: release => ({...release, target_commitish: other})});
      await expect(fetchHonk({commit, api, out})).rejects.toThrow(`the release targets ${other}, doona pins ${commit}`);
    });

    it('checks the source tag even when the release targets the commit', async () => {
      const {api, out} = await serve({refs: {[ref]: {type: 'commit', sha: other}}});
      await expect(fetchHonk({commit, api, out})).rejects.toThrow(`source tag debug.2026.9.26.native-api.4 points to ${other}, doona pins ${commit}`);
    });

    it('refuses a pin that is not a full SHA', async () => {
      await expect(fetchHonk({commit: commit.slice(0, 8), out: 'unused'})).rejects.toThrow('is not a full commit SHA');
    });

    it('reads the committed pin', async () => {
      await expect(readPin()).resolves.toMatch(/^[0-9a-f]{40}$/);
      expect(PIN_FILE).toMatch(/tools\/honk-commit\.txt$/);
    });
  });

  describe('with a release that targets a branch', () => {
    const branch = {edit: release => ({...release, target_commitish: 'main'})};

    it('checks the pinned commit through the source tag', async () => {
      const {api, archive, out} = await serve({...branch, refs: {[ref]: {type: 'commit', sha: commit}}});
      const {source} = await fetchHonk({commit, api, archive, out});
      expect(source.commit).toBe(commit);
    });

    it('follows an annotated source tag to its commit', async () => {
      const tag = 'a'.repeat(40);
      const refs = {[ref]: {type: 'tag', sha: tag}, [`/repos/Glassyiris/honk/git/tags/${tag}`]: {type: 'commit', sha: commit}};
      const {api, archive, out} = await serve({...branch, refs});
      await expect(fetchHonk({commit, api, archive, out})).resolves.toMatchObject({source: {commit}});
    });

    it('fails when the source tag points elsewhere', async () => {
      const {api, out} = await serve({...branch, refs: {[ref]: {type: 'commit', sha: other}}});
      await expect(fetchHonk({commit, api, out})).rejects.toThrow(`source tag debug.2026.9.26.native-api.4 points to ${other}, doona pins ${commit}`);
      expect(existsSync(join(out, SOURCE_NOTE))).toBe(false);
    });

    it('fails when the source tag cannot be read', async () => {
      const {api, out} = await serve({...branch, refs: {}});
      await expect(fetchHonk({commit, api, out})).rejects.toThrow('GET source tag Glassyiris/honk@debug.2026.9.26.native-api.4: HTTP 404');
      expect(readdirSync(out)).toEqual([]);
    });
  });

  it('fails when a download is not found', async () => {
    const {api, out} = await serve({
      edit: release => ({
        ...release,
        assets: release.assets.map(asset => ({...asset, browser_download_url: asset.browser_download_url.replace('/download/', '/gone/')}))
      })
    });
    await expect(fetchHonk({commit, api, out})).rejects.toThrow('HTTP 404');
  });
});
