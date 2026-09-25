import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {setImmediate} from 'node:timers/promises';
import {afterEach, describe, expect, it} from 'vitest';
import {parse} from 'yaml';
import {validateResponse, walk} from './conformance.mjs';

const contract = parse(readFileSync(new URL('../contract/api-standardize/openapi.yaml', import.meta.url), 'utf8'));
const servers = [];
const failures = checks => checks.filter(check => check.status === 'FAIL').map(check => check.id);
// Shared responses live under components; a $ref there is followed once.
function resolve(node) {
  return node?.$ref
    ? node.$ref
        .replace(/^#\//, '')
        .split('/')
        .reduce((owner, key) => owner[key], contract)
    : node;
}
function example(path, status = 200, method = 'get') {
  const response = resolve(contract.paths[path][method].responses[status]);
  const fixture = Object.values(response.content['application/json'].examples)[0];
  return {status, body: structuredClone(fixture.value), headers: {...fixture['x-headers']}};
}
function errorResponse(code, status) {
  const response = example('/api/v1/runtime/traffic/history', 400);
  response.status = status;
  response.body.error.code = code;
  return response;
}

it('reports missing, malformed and incomplete custom contracts as usage errors', () => {
  const directory = mkdtempSync(new URL('./.conformance-', import.meta.url));
  try {
    const file = `${directory}/openapi.yaml`;
    for (const content of [null, 'paths: [', 'paths: {}']) {
      if (content !== null) writeFileSync(file, content);
      const result = spawnSync(process.execPath, ['tools/conformance.mjs', 'http://127.0.0.1:4351', '--contract', file], {encoding: 'utf8'});
      expect(result.status, result.stderr).toBe(2);
    }
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
});

async function serve({broken = false, mutate = () => {}, events = 'ready', resume = 409, unauthorized} = {}) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const path = url.pathname.replace(/^\/proxy/, '');
    requests.push({path, query: url.search, method: request.method, headers: request.headers});
    // Every SSE resource in the contract (events, logs) answers with the same ready frame.
    const streams = Object.keys(contract.paths).filter(candidate => contract.paths[candidate].get?.responses?.['200']?.content?.['text/event-stream']);
    if (streams.includes(path) && !request.headers['last-event-id']) {
      response.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
      response.flushHeaders();
      if (events === 'timeout') return;
      const runtime = example('/api/v1/runtime').body;
      const data = {instance_id: runtime.instance_id, observed_at: runtime.observed_at, note: 'café'};
      if (events === 'bad-data') data.observed_at = 'yesterday';
      const frame = `: heartbeat\r\n\r\nevent: stream.ready\r\n${events === 'missing-id' ? '' : 'id: instance-7:123\r\n'}data: ${JSON.stringify(data)}\r\n\r\n`;
      const bytes = Buffer.from(events === 'unterminated' ? frame.slice(0, -4) : frame);
      for (const byte of bytes) {
        if (response.destroyed) break;
        response.write(Buffer.from([byte]));
        await setImmediate();
      }
      response.end();
      return;
    }
    let fixture;
    if (streams.includes(path)) {
      if (resume === 200 || resume === 'comment-only' || resume === 'late-ready') {
        response.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
        const runtime = example('/api/v1/runtime').body;
        const ready = `event: stream.ready\nid: resumed:124\ndata: ${JSON.stringify({instance_id: runtime.instance_id, observed_at: runtime.observed_at})}\n\n`;
        const prior = `event: runtime.updated\nid: resumed:123\ndata: ${JSON.stringify({instance_id: runtime.instance_id, observed_at: runtime.observed_at, href: '/api/v1/runtime'})}\n\n`;
        response.end(resume === 'comment-only' ? ': resumed\n\n' : resume === 'late-ready' ? prior + ready : ready);
        return;
      }
      fixture = resume === 401 ? errorResponse('authentication_required', 401) : example(path, 409);
      if (resume === 'wrong-code') fixture.body.error.code = 'state_conflict';
    } else {
      const template = Object.keys(contract.paths).find(candidate => {
        const pattern = candidate.replace(/\{[^}]+\}/g, '[^/]+');
        return contract.paths[candidate].get && new RegExp(`^${pattern}$`).test(path);
      });
      if (!template) {
        response.writeHead(404);
        response.end();
        return;
      }
      fixture = example(template);
      if (url.searchParams.has('cursor')) fixture.body.next_cursor = null;
      if (broken && path === '/api/v1/runtime') fixture.body.traffic.bytes.upload = 123;
      if (broken && path === '/api/v1/runtime/memory') delete fixture.headers['Cache-Control'];
      if (broken && path === '/api/v1/runtime/traffic/history') fixture = errorResponse('invented_error', 400);
      if (path === unauthorized) fixture = errorResponse('authentication_required', 401);
    }
    mutate(path, fixture, url);
    response.writeHead(fixture.status, fixture.headers);
    response.end(JSON.stringify(fixture.body));
  });
  servers.push(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {baseUrl: `http://127.0.0.1:${server.address().port}`, requests};
}

afterEach(async () => {
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

describe('native API conformance', () => {
  it('walks contract examples, observed ids, one cursor page, and a resumable stream without mutations', async () => {
    const server = await serve();
    const result = await walk({baseUrl: `${server.baseUrl}/proxy/`, token: 'test-secret'});
    expect(failures(result.checks)).toEqual([]);
    expect(result.summary.exitCode).toBe(0);
    const observedPaths = Object.entries(contract.paths)
      .filter(([, item]) => item.get?.['x-permission'] === 'observe')
      .map(([path]) =>
        path
          .replace('{groupId}', 'group-proxy')
          .replace('{flow_id}', 'flow-23')
          .replace('/nodes/{id}', '/nodes/node-hk-01')
          .replace('{id}', 'provider-a')
          .replace('{source_id}', 'source-main')
      );
    expect(new Set(server.requests.map(request => request.path))).toEqual(new Set(['/api', '/api/v1/version', '/api/v1/capabilities', ...observedPaths]));
    expect(server.requests.slice(0, 3).map(request => request.path)).toEqual(['/api', '/api/v1/version', '/api/v1/capabilities']);
    expect(server.requests.every(request => request.method === 'GET' && request.headers.authorization === 'Bearer test-secret')).toBe(true);
    expect(
      server.requests.every(request => request.headers.accept === (/\/(events|logs)$/.test(request.path) ? 'text/event-stream' : 'application/json'))
    ).toBe(true);
    const pages = server.requests.filter(request => request.path === '/api/v1/dns/cache');
    expect(pages.map(request => request.query)).toEqual(['', '?cursor=eyJvZmZzZXQiOjEwMH0']);
    expect(server.requests.filter(request => request.path.endsWith('/events')).map(request => request.headers['last-event-id'])).toEqual([
      undefined,
      'instance-7:123'
    ]);
    expect(result.summary.heartbeats).toEqual([': heartbeat', ': heartbeat']);
  });

  it('reports exactly the three planted GET failures', async () => {
    const server = await serve({broken: true});
    const result = await walk({baseUrl: server.baseUrl});
    expect(failures(result.checks)).toEqual(['getRuntime.body', 'getRuntimeMemory.cache-control', 'getTrafficHistory.body']);
    expect(result.summary.exitCode).toBe(1);
  });

  it('checks accepted control responses without making a control request', () => {
    const fixture = example('/api/v1/operations/reload', 202, 'post');
    expect(failures(validateResponse({operationId: 'startReload', ...fixture}))).toEqual([]);
    delete fixture.headers['Retry-After'];
    expect(failures(validateResponse({operationId: 'startReload', ...fixture}))).toEqual(['startReload.retry-after']);
  });

  it('keeps UInt64 precision, rejects overflow and noncanonical strings, and validates calendar dates', () => {
    const fixture = example('/api/v1/runtime');
    fixture.body.traffic.bytes.upload = '18446744073709551615';
    expect(failures(validateResponse({operationId: 'getRuntime', ...fixture}))).toEqual([]);
    for (const value of ['18446744073709551616', '01']) {
      fixture.body.traffic.bytes.upload = value;
      expect(failures(validateResponse({operationId: 'getRuntime', ...fixture}))).toEqual(['getRuntime.body']);
    }
    fixture.body.traffic.bytes.upload = '0';
    fixture.body.observed_at = '2026-02-30T12:00:00Z';
    expect(failures(validateResponse({operationId: 'getRuntime', ...fixture}))).toEqual(['getRuntime.body']);
  });

  it('uses second-page ids, respects unavailable resources, and never invents an id', async () => {
    const server = await serve({
      mutate(path, fixture, url) {
        if (path === '/api/v1/capabilities') fixture.body.resources.runtime.available = false;
        if (path === '/api/v1/groups') fixture.body = [];
        if (path === '/api/v1/flows' && !url.searchParams.has('cursor')) {
          fixture.body.flows = [];
          fixture.body.next_cursor = 'next';
        }
      }
    });
    const result = await walk({baseUrl: server.baseUrl, only: ['getRuntime', 'listGroups', 'getGroup', 'listFlows', 'getFlow']});
    expect(failures(result.checks)).toEqual(['getRuntime.request']);
    expect(result.checks).toContainEqual({
      id: 'getRuntime.request',
      operation: 'getRuntime',
      status: 'FAIL',
      detail: 'selected but not run: capability unavailable'
    });
    expect(result.checks).toContainEqual({id: 'getGroup.request', operation: 'getGroup', status: 'SKIP', detail: 'no observed id for groupId'});
    expect(server.requests.filter(request => request.path.startsWith('/api/v1/flows')).map(request => request.path + request.query)).toEqual([
      '/api/v1/flows',
      '/api/v1/flows?cursor=next',
      '/api/v1/flows/flow-23'
    ]);
  });

  it('stops unauthenticated requests after 401, but always negotiates before filters', async () => {
    const server = await serve({unauthorized: '/api/v1/runtime'});
    const result = await walk({baseUrl: server.baseUrl, skip: ['getDiscovery']});
    expect(failures(result.checks)).toEqual([]);
    // The contract lists /config before /runtime; the walk stops at the first 401.
    expect(server.requests.map(request => request.path)).toEqual(['/api', '/api/v1/version', '/api/v1/capabilities', '/api/v1/config', '/api/v1/runtime']);
    // validateConfig sits before /runtime in the contract and is a POST, skipped by design rather than for the token.
    expect(
      result.checks.filter(check => check.status === 'SKIP' && !check.detail.startsWith('SKIP by design')).every(check => check.detail === 'needs token')
    ).toBe(true);
    expect(server.requests.every(request => request.headers.authorization === undefined)).toBe(true);
  });

  it.each(['initial', 'page2'])('fails explicitly selected authentication-blocked %s requests', async phase => {
    const server = await serve({
      mutate(path, fixture, url) {
        if (path === '/api/v1/dns/cache' && (phase === 'initial' || url.searchParams.has('cursor'))) {
          Object.assign(fixture, errorResponse('authentication_required', 401));
        }
      }
    });
    const result = await walk({baseUrl: server.baseUrl, only: ['listDnsCache']});
    expect(result.summary.exitCode).toBe(1);
    expect(failures(result.checks)).toEqual([`listDnsCache${phase === 'page2' ? '.page2' : ''}.request`]);
  });

  it.each([401, 403])('fails a selected operation refused with HTTP %s despite a supplied token', async status => {
    const server = await serve({
      mutate(path, fixture) {
        if (path === '/api/v1/runtime') Object.assign(fixture, errorResponse(status === 401 ? 'authentication_required' : 'permission_denied', status));
      }
    });
    const result = await walk({baseUrl: server.baseUrl, token: 'refused-token', only: ['getRuntime']});
    expect(result.summary.exitCode).toBe(1);
    expect(failures(result.checks)).toContain('getRuntime.request');
  });

  it('gates independent runtime and DNS resources by their own capabilities', async () => {
    const selected = ['getRuntimeMemory', 'getRuntimeOutbounds', 'getRuntimeSettings', 'getTrafficHistory', 'getMemoryHistory', 'listDnsLog', 'listDnsCache'];
    const server = await serve({
      mutate(path, fixture) {
        if (path !== '/api/v1/capabilities') return;
        for (const key of ['runtime', 'memory_history', 'dns_log']) fixture.body.resources[key].available = false;
      }
    });
    const result = await walk({baseUrl: server.baseUrl, only: selected});
    expect(failures(result.checks)).toEqual(['getMemoryHistory.request', 'listDnsLog.request']);
    expect(new Set(server.requests.map(request => request.path))).toEqual(
      new Set([
        '/api',
        '/api/v1/version',
        '/api/v1/capabilities',
        '/api/v1/runtime/memory',
        '/api/v1/runtime/outbounds',
        '/api/v1/runtime/settings',
        '/api/v1/runtime/traffic/history',
        '/api/v1/dns/cache'
      ])
    );
  });

  it('requires operation-specific diagnostics on source validation refusal', () => {
    const fixture = example('/api/v1/config/sources/{source_id}', 422, 'put');
    expect(failures(validateResponse({operationId: 'replaceConfigSource', ...fixture}))).toEqual([]);
    delete fixture.body.error.details;
    expect(failures(validateResponse({operationId: 'replaceConfigSource', ...fixture}))).toEqual(['replaceConfigSource.body']);
  });

  it.each([
    ['missing-id', 'streamEvents.ready'],
    ['bad-data', 'streamEvents.event-1'],
    ['unterminated', 'streamEvents.ready'],
    ['timeout', 'streamEvents.ready']
  ])('rejects %s SSE within the request deadline', async (events, failure) => {
    const server = await serve({events});
    const result = await walk({baseUrl: server.baseUrl, only: ['streamEvents'], timeout: 500});
    expect(failures(result.checks)).toEqual([failure]);
    expect(result.summary.exitCode).toBe(1);
  });

  it('accepts an open resumed stream and rejects a different 409 code', async () => {
    const accepted = await serve({resume: 200});
    expect(failures((await walk({baseUrl: accepted.baseUrl, only: ['streamEvents']})).checks)).toEqual([]);
    const rejected = await serve({resume: 'wrong-code'});
    expect(failures((await walk({baseUrl: rejected.baseUrl, only: ['streamEvents']})).checks)).toEqual(['streamEvents.reconnect.resume']);
  });

  it.each(['comment-only', 'late-ready'])('rejects %s resumed streams', async resume => {
    const server = await serve({resume});
    const result = await walk({baseUrl: server.baseUrl, only: ['streamEvents']});
    expect(result.summary.exitCode).toBe(1);
    expect(failures(result.checks)).toContain(`streamEvents.reconnect.${resume === 'comment-only' ? 'ready' : 'first-event'}`);
  });

  it('fails an explicitly selected stream when reconnect first requires authentication', async () => {
    const server = await serve({resume: 401});
    const result = await walk({baseUrl: server.baseUrl, only: ['streamEvents']});
    expect(result.summary.exitCode).toBe(1);
    expect(failures(result.checks)).toEqual(['streamEvents.reconnect.request']);
  });
});
