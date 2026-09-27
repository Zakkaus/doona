import {createHash} from 'node:crypto';
import {existsSync, mkdtempSync, readdirSync, readFileSync, rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {expectedAssets, fetchHonk, parseBody, SOURCE_NOTE} from './fetch-honk.mjs';

const commit = '5d8f32c10fc01363cea33dcdb9b1c155e2449fa2';
const body = [
  'Rolling debug build; replaced by subsequent successful debug-tag runs.',
  '',
  'Source tag: `debug.2026.9.26.native-api.4`',
  `Commit: \`${commit}\``,
  'Build: https://github.com/Glassyiris/honk/actions/runs/36241239721',
  ''
].join('\n');
const servers = [];
const dirs = [];
const sha256 = data => createHash('sha256').update(data).digest('hex');

// A GitHub release API stand-in: `edit` adjusts the release JSON, `served` the bytes behind one asset name.
async function serve({edit = release => release, served = {}} = {}) {
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
  return {api: `http://127.0.0.1:${server.address().port}`, out, contents};
}

afterEach(async () => {
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true});
  await Promise.all(
    servers.splice(0).map(
      server =>
        new Promise((resolve, reject) => {
          server.close(error => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        })
    )
  );
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

  it('downloads every build and writes the source note', async () => {
    const {api, out, contents} = await serve();
    const {files} = await fetchHonk({api, out});
    expect(files.map(file => file.name)).toEqual(expectedAssets());
    expect(readdirSync(out).sort()).toEqual([...expectedAssets(), SOURCE_NOTE].sort());
    for (const name of expectedAssets()) expect(readFileSync(join(out, name), 'utf8')).toBe(contents[name]);
    const note = readFileSync(join(out, SOURCE_NOTE), 'utf8');
    expect(note).toContain('Source tag: debug.2026.9.26.native-api.4');
    expect(note).toContain(`Corresponding source: https://github.com/Glassyiris/honk/tree/${commit}`);
    expect(note).toContain('Licence: GPL-3.0-only');
    expect(note).toContain(`${sha256(contents[expectedAssets()[0]])}  ${expectedAssets()[0]}`);
  });

  it('fails on a digest mismatch and keeps no partial file', async () => {
    const name = expectedAssets()[3];
    const {api, out} = await serve({served: {[name]: 'tampered'}});
    await expect(fetchHonk({api, out})).rejects.toThrow(`${name}: sha256 ${sha256('tampered')}`);
    expect(existsSync(join(out, name))).toBe(false);
    expect(existsSync(join(out, `${name}.part`))).toBe(false);
    expect(existsSync(join(out, SOURCE_NOTE))).toBe(false);
  });

  it('fails when a build is missing', async () => {
    const name = expectedAssets()[5];
    const {api, out} = await serve({edit: release => ({...release, assets: release.assets.filter(asset => asset.name !== name)})});
    await expect(fetchHonk({api, out})).rejects.toThrow(`release lacks ${name}`);
  });

  it('fails on a build it does not recognise', async () => {
    const extra = {name: 'honk-core-debug-riscv64gc-unknown-linux-gnu.tar.gz', digest: `sha256:${'0'.repeat(64)}`, browser_download_url: 'http://127.0.0.1:1/'};
    const {api, out} = await serve({edit: release => ({...release, assets: [...release.assets, extra]})});
    await expect(fetchHonk({api, out})).rejects.toThrow('unrecognised builds honk-core-debug-riscv64gc-unknown-linux-gnu.tar.gz');
  });

  it('fails when an asset carries no digest', async () => {
    const {api, out} = await serve({edit: release => ({...release, assets: release.assets.map(({digest: _digest, ...asset}) => asset)})});
    await expect(fetchHonk({api, out})).rejects.toThrow('the API reports no sha256 digest');
  });

  it('fails when the body and the release disagree on the commit', async () => {
    const {api, out} = await serve({edit: release => ({...release, target_commitish: 'f'.repeat(40)})});
    await expect(fetchHonk({api, out})).rejects.toThrow(`release body names commit ${commit}`);
  });

  it('fails when a download is not found', async () => {
    const {api, out} = await serve({
      edit: release => ({
        ...release,
        assets: release.assets.map(asset => ({...asset, browser_download_url: asset.browser_download_url.replace('/download/', '/gone/')}))
      })
    });
    await expect(fetchHonk({api, out})).rejects.toThrow('HTTP 404');
  });
});
