import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {setImmediate} from 'node:timers/promises';
import {afterEach, describe, expect, it} from 'vitest';
import {parse} from 'yaml';
import {validateResponse, walk} from './conformance.mjs';

const contract = parse(readFileSync(new URL('../contract/api-standardize/openapi.yaml', import.meta.url), 'utf8'));
const servers = [];
const failures = checks => checks.filter(check => check.status === 'FAIL').map(check => check.id);
function example(path, status = 200, method = 'get') {
  const response = contract.paths[path][method].responses[status];
  const fixture = Object.values(response.content['application/json'].examples)[0];
  return {status, body: structuredClone(fixture.value), headers: {...fixture['x-headers']}};
}
function errorResponse(code, status) {
  const response = example('/api/v1/runtime/traffic/history', 400);
  response.status = status;
  response.body.error.code = code;
  return response;
}

async function serve({broken = false, mutate = () => {}, events = 'ready', resume = 409, unauthorized} = {}) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const path = url.pathname.replace(/^\/proxy/, '');
    requests.push({path, query: url.search, method: request.method, headers: request.headers});
    if (path === '/api/v1/events' && !request.headers['last-event-id']) {
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
    if (path === '/api/v1/events') {
      if (resume === 200) {
        response.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
        response.end(': resumed\n\n');
        return;
      }
      fixture = example(path, 409);
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
      .map(([path]) => path.replace('{groupId}', 'group-proxy').replace('{flow_id}', 'flow-23'));
    expect(new Set(server.requests.map(request => request.path))).toEqual(new Set(['/api', '/api/v1/version', '/api/v1/capabilities', ...observedPaths]));
    expect(server.requests.slice(0, 3).map(request => request.path)).toEqual(['/api', '/api/v1/version', '/api/v1/capabilities']);
    expect(server.requests.every(request => request.method === 'GET' && request.headers.authorization === 'Bearer test-secret')).toBe(true);
    expect(server.requests.every(request => request.headers.accept === (request.path.endsWith('/events') ? 'text/event-stream' : 'application/json'))).toBe(
      true
    );
    const pages = server.requests.filter(request => request.path === '/api/v1/dns/cache');
    expect(pages.map(request => request.query)).toEqual(['', '?cursor=eyJvZmZzZXQiOjEwMH0']);
    expect(server.requests.filter(request => request.path.endsWith('/events')).map(request => request.headers['last-event-id'])).toEqual([
      undefined,
      'instance-7:123'
    ]);
    expect(result.summary.heartbeats).toEqual([': heartbeat']);
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
    expect(failures(result.checks)).toEqual([]);
    expect(result.checks).toContainEqual({id: 'getRuntime.request', operation: 'getRuntime', status: 'SKIP', detail: 'capability unavailable'});
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
    expect(server.requests.map(request => request.path)).toEqual(['/api', '/api/v1/version', '/api/v1/capabilities', '/api/v1/runtime']);
    expect(result.checks.filter(check => check.status === 'SKIP').every(check => check.detail === 'needs token')).toBe(true);
    expect(server.requests.every(request => request.headers.authorization === undefined)).toBe(true);
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
});
