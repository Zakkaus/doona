/**
 * Usage: node tools/conformance.mjs <server-root> [--token T] [--only opId,...]
 *        [--skip opId,...] [--json] [--timeout ms]
 * Node 22+. Exit: 0 passes, 1 contract failures, 2 usage/unreachable server.
 * Discovery, version, and capabilities precede filters. Only GET observe operations
 * run after them: mutations, diagnostic DNS, and observe-owner-or-control are SKIP
 * by design. Missing observed ids/query values, unavailable capabilities, filters,
 * and requests after an unauthenticated 401 are also SKIP; no ids are invented.
 * Capability keys use x-capability when present, otherwise the first path segment
 * after /api/v1/ (the bundle has no mapping extension). Nested resources therefore
 * share that fallback key. The base may include a reverse-proxy prefix.
 * Follow one cursor page; close SSE after stream.ready and reconnect once.
 * The read-only walk cannot exercise 202: validateResponse also accepts control
 * operation responses for offline fixtures, without sending control requests.
 */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {parse} from 'yaml';

const contract = parse(readFileSync(new URL('../contract/api-standardize/openapi.yaml', import.meta.url), 'utf8'));
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);
const operations = Object.entries(contract.paths).flatMap(([path, item]) =>
  Object.entries(item)
    .filter(([method]) => methods.has(method))
    .map(([method, operation]) => ({...operation, path, method, parameters: [...(item.parameters ?? []), ...(operation.parameters ?? [])]}))
);
const byId = new Map(operations.map(operation => [operation.operationId, operation]));
const firstPaths = ['/api', '/api/v1/version', '/api/v1/capabilities'];
const ajv = new Ajv2020({allErrors: true, strict: false, validateFormats: true});
addFormats(ajv, {mode: 'full'});
const schemas = structuredClone(contract.components.schemas);
// Keep string enforcement independent of the vendored UInt64 type annotation.
schemas.UInt64 = {allOf: [schemas.UInt64, {type: 'string'}]};
const validators = new Map();

function resolve(value) {
  if (!value?.$ref) return value;
  const {$ref, ...siblings} = value;
  if (!$ref.startsWith('#/')) throw new Error('Contract contains an external reference');
  const target = $ref
    .slice(2)
    .split('/')
    .reduce((node, key) => node[key.replaceAll('~1', '/').replaceAll('~0', '~')], contract);
  return {...resolve(target), ...siblings};
}

function schemaErrors(schema, body) {
  const key = schema.$ref && Object.keys(schema).length === 1 ? schema.$ref : schema;
  let validate = validators.get(key);
  if (!validate) {
    validate = ajv.compile({...schema, components: {schemas}});
    validators.set(key, validate);
  }
  if (validate(body)) return [];
  return validate.errors.map(error => `${error.instancePath || '/'} ${error.message}`);
}

function check(operation, suffix, status, detail, variant = '') {
  return {id: `${operation}${variant}.${suffix}`, operation, status, detail};
}

/** Validate one decoded response; body failures include UInt64, timestamps, and error codes. */
export function validateResponse({operationId, status, headers, body, variant = '', bodyError}) {
  const operation = byId.get(operationId);
  if (!operation) throw new Error('Unknown operationId');
  headers = new Headers(headers);
  const checks = [];
  const report = (id, passed, detail) => checks.push(check(operationId, id, passed ? 'PASS' : 'FAIL', detail, variant));
  const listed = operation.responses[String(status)] ?? operation.responses[`${Math.floor(status / 100)}XX`] ?? operation.responses.default;
  report('status', Boolean(listed), `HTTP ${status}${listed ? ' is listed' : ' is not listed'}`);
  const response = resolve(listed ?? (status === 202 ? contract.components.responses.OperationAccepted : contract.components.responses.ErrorResponseCommon));
  const streaming = status === 200 && Boolean(response.content?.['text/event-stream']);
  const mediaType = streaming ? 'text/event-stream' : 'application/json';
  report('content-type', headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() === mediaType, `Content-Type must be ${mediaType}`);
  const requiredHeaders = {...response.headers};
  if (status === 202) Object.assign(requiredHeaders, resolve(contract.components.responses.OperationAccepted).headers, response.headers);
  for (const [name, definition] of Object.entries(requiredHeaders)) {
    const header = resolve(definition);
    const raw = headers.get(name);
    if (raw === null && !header.required) continue;
    const schema = header.schema;
    let errors = raw === null ? ['is required'] : [];
    if (raw !== null && schema) {
      if (schema.type === 'integer') {
        errors = /^\d+$/.test(raw) ? schemaErrors(schema, Number(raw)) : ['must be integer seconds'];
      } else errors = schemaErrors(schema, raw);
    }
    if (status === 202 && name.toLowerCase() === 'location' && raw !== null && raw !== body?.href) errors.push('must equal body href');
    report(name.toLowerCase(), errors.length === 0, `${name}${errors.length ? ` ${errors.join('; ')}` : ' matches the contract'}`);
  }
  if (!streaming) {
    const schema = status >= 400 && status < 500 ? {$ref: '#/components/schemas/ErrorResponse'} : response.content?.['application/json']?.schema;
    if (!listed && status !== 202 && !(status >= 400 && status < 500)) {
      checks.push(check(operationId, 'body', 'SKIP', 'no response schema for this status', variant));
    } else {
      const errors = bodyError ? [bodyError] : schema ? schemaErrors(schema, body) : ['no JSON response schema'];
      report('body', errors.length === 0, errors.length ? errors.join('; ') : 'body matches the schema, UInt64 strings, and RFC 3339 timestamps');
    }
  }
  return checks;
}

async function readReady(body, eventSchemas, report, heartbeat) {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', {fatal: true});
  let buffer = '',
    event = '',
    id,
    data = [],
    frameNumber = 0;
  function line(text) {
    if (text.startsWith(':')) {
      heartbeat(text);
      return;
    }
    if (text === '') {
      if (!data.length) {
        event = '';
        id = undefined;
        return;
      }
      const kind = event || 'message';
      const frameId = id;
      const payload = data.join('\n');
      event = '';
      id = undefined;
      data = [];
      frameNumber++;
      const schema = eventSchemas[kind];
      let errors;
      try {
        const value = JSON.parse(payload);
        errors = schema ? schemaErrors({$ref: schema}, value) : ['event name has no contract schema'];
      } catch {
        errors = ['event data is not JSON'];
      }
      report(`event-${frameNumber}`, errors.length === 0, errors.length ? errors.join('; ') : `${kind} data matches the contract`);
      if (kind === 'stream.ready') {
        report('ready', Boolean(frameId), frameId ? 'stream.ready has an id' : 'stream.ready is missing an id');
        return {id: frameId};
      }
      return;
    }
    const colon = text.indexOf(':');
    const key = colon < 0 ? text : text.slice(0, colon);
    let value = colon < 0 ? '' : text.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (key === 'event') event = value;
    if (key === 'data') data.push(value);
    if (key === 'id' && !value.includes('\0')) id = value;
  }
  try {
    while (true) {
      const {value, done} = await reader.read();
      buffer += decoder.decode(value, {stream: !done});
      let start = 0;
      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] !== '\r' && buffer[i] !== '\n') continue;
        if (buffer[i] === '\r' && i === buffer.length - 1 && !done) break;
        const ready = line(buffer.slice(start, i));
        if (ready) return ready;
        if (buffer[i] === '\r' && buffer[i + 1] === '\n') i++;
        start = i + 1;
      }
      buffer = buffer.slice(start);
      if (done) throw new Error('stream ended before stream.ready');
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function options({baseUrl, timeout = 5000, only = [], skip = []}) {
  let root;
  try {
    root = new URL(baseUrl);
  } catch {
    throw new Error('base-url must be an absolute HTTP(S) server root');
  }
  if (!['http:', 'https:'].includes(root.protocol) || root.username || root.password || root.search || root.hash) {
    throw new Error('base-url must use HTTP(S), without credentials, query, or fragment');
  }
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 2147483647) throw new Error('timeout must be an integer from 1 to 2147483647 ms');
  for (const id of [...only, ...skip]) if (!byId.has(id)) throw new Error('only/skip contains an unknown operationId');
  return {root: root.href.replace(/\/+$/, ''), timeout, only: new Set(only), skip: new Set(skip)};
}

function observedValue(name, bodies) {
  const snake = name.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    for (const key of [name, snake]) if (typeof value[key] === 'string' || typeof value[key] === 'number') return value[key];
    for (const child of Object.values(value)) {
      const found = visit(child);
      if (found !== undefined) return found;
    }
  }
  for (const body of bodies) {
    const found = visit(body);
    if (found !== undefined) return found;
  }
}

function observedPath(path, snapshots) {
  let missing;
  const filled = path.replace(/\{([^}]+)\}/g, (placeholder, name, offset) => {
    // The list that names the id is the nearest ancestor that was fetched: /groups for /groups/{groupId},
    // /config for /config/sources/{source_id}.
    let parent = path.slice(0, offset).replace(/\/$/, '');
    let item;
    while (parent.includes('/') && item === undefined) {
      const bodies = snapshots.get(parent) ?? [];
      const arrays = bodies.flatMap(body => (Array.isArray(body) ? [body] : Object.values(body ?? {}).filter(Array.isArray)));
      item = arrays.flat().find(value => value && typeof value === 'object' && typeof (value[name] ?? value.id) === 'string');
      parent = parent.slice(0, parent.lastIndexOf('/'));
    }
    if (!item) {
      missing = name;
      return placeholder;
    }
    return encodeURIComponent(item[name] ?? item.id);
  });
  return {filled, missing};
}

/** Walk the vendored read-only contract. fetch is injectable; no mutations or redirects are sent. */
export async function walk({baseUrl, fetch = globalThis.fetch, token, timeout, only, skip} = {}) {
  const settings = options({baseUrl, timeout, only, skip});
  const checks = [],
    heartbeats = [],
    snapshots = new Map();
  let capabilities,
    needsToken = false,
    unreachable = false;
  const clean = value => (token ? value.replaceAll(token, '[redacted]') : value).replace(/[\r\n]/g, ' ');
  const add = entry => checks.push({...entry, detail: clean(entry.detail)});
  const skipped = (operation, detail, variant = '') => add(check(operation.operationId, 'request', 'SKIP', detail, variant));
  const serverPath = new URL(contract.servers[0].url, 'http://contract.invalid').pathname.replace(/\/$/, '');

  async function request(operation, path, variant = '', cursor) {
    if (needsToken || unreachable) {
      skipped(operation, needsToken ? 'needs token' : 'server unreachable', variant);
      return;
    }
    const operationId = operation.operationId;
    const eventSchemas = resolve(operation.responses['200'])?.content?.['text/event-stream']?.['x-event-data-schemas'];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), settings.timeout);
    let response;
    try {
      const headers = {Accept: eventSchemas ? 'text/event-stream' : 'application/json'};
      if (token !== undefined) headers.Authorization = `Bearer ${token}`;
      if (cursor !== undefined) headers['Last-Event-ID'] = cursor;
      response = await fetch(settings.root + serverPath + path, {headers, cache: 'no-store', redirect: 'manual', signal: controller.signal});
      if (response.status === 401 && token === undefined) {
        needsToken = true;
        skipped(operation, 'needs token', variant);
        await response.body?.cancel();
        return;
      }
      const streaming = eventSchemas && response.status === 200;
      let body, bodyError;
      if (!streaming) {
        try {
          body = JSON.parse(await response.text());
        } catch {
          bodyError = controller.signal.aborted ? 'response body timed out' : 'response body is not JSON';
        }
      }
      for (const entry of validateResponse({operationId, status: response.status, headers: response.headers, body, bodyError, variant})) add(entry);
      if (cursor !== undefined) {
        const accepted = response.status === 200 || (response.status === 409 && body?.error?.code === 'event_cursor_expired');
        add(check(operationId, 'resume', accepted ? 'PASS' : 'FAIL', 'resume requires 200 or 409 event_cursor_expired', variant));
        await response.body?.cancel().catch(() => {});
      } else if (streaming) {
        const report = (id, passed, detail) => add(check(operationId, id, passed ? 'PASS' : 'FAIL', detail, variant));
        try {
          const ready = await readReady(response.body, eventSchemas, report, text => heartbeats.push(clean(text)));
          return {cursor: ready.id};
        } catch {
          report('ready', false, controller.signal.aborted ? 'stream.ready timed out' : 'stream ended or framing failed before stream.ready');
        }
      } else if (eventSchemas) {
        add(check(operationId, 'ready', 'FAIL', 'stream.ready requires an open 200 stream', variant));
      }
      if (response.ok && !bodyError) return {body};
    } catch {
      if (!response) {
        unreachable = true;
        add(check(operationId, 'request', 'FAIL', controller.signal.aborted ? 'server unreachable: request timed out' : 'server unreachable', variant));
      } else add(check(operationId, 'request', 'FAIL', 'response could not be read', variant));
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  const ordered = [
    ...firstPaths.map(path => operations.find(operation => operation.path === path && operation.method === 'get')),
    ...operations.filter(operation => !firstPaths.includes(operation.path)).sort((a, b) => Number(a.path.includes('{')) - Number(b.path.includes('{')))
  ];
  for (const operation of ordered) {
    const mandatory = firstPaths.includes(operation.path);
    let reason;
    if (needsToken) reason = 'needs token';
    else if (unreachable) reason = 'server unreachable';
    else if (!mandatory) {
      const resource = operation['x-capability'] ?? operation.path.replace(/^\/api\/v1\//, '').split('/')[0];
      if (capabilities?.resources?.[resource]?.available === false) reason = 'capability unavailable';
      else if (operation.method !== 'get' || operation['x-permission'] !== 'observe')
        reason = `SKIP by design: ${operation.method.toUpperCase()} ${operation['x-permission'] ?? 'unclassified'}`;
      else if (settings.skip.has(operation.operationId) || (settings.only.size && !settings.only.has(operation.operationId))) reason = 'filtered';
    }
    const {filled, missing} = observedPath(operation.path, snapshots);
    if (!reason && missing) reason = `no observed id for ${missing}`;
    if (reason) {
      skipped(operation, reason);
      continue;
    }
    const parameters = operation.parameters.map(resolve);
    const result = await request(operation, filled);
    if (result?.body !== undefined) {
      snapshots.set(operation.path, [result.body]);
      if (operation.path === '/api/v1/capabilities') capabilities = result.body;
      if (result.body?.next_cursor) {
        const query = new URLSearchParams({cursor: result.body.next_cursor});
        const page = await request(operation, `${filled}?${query}`, '.page2');
        if (page?.body !== undefined) snapshots.get(operation.path).push(page.body);
      }
    }
    if (result?.cursor) await request(operation, filled, '.reconnect', result.cursor);
    const required = parameters.filter(parameter => parameter.in === 'query' && parameter.required);
    if (required.length) {
      const query = new URLSearchParams();
      const missingQuery = [];
      for (const parameter of required) {
        const value = observedValue(parameter.name, snapshots.values());
        if (value === undefined || schemaErrors(parameter.schema, value).length) missingQuery.push(parameter.name);
        else query.set(parameter.name, String(value));
      }
      if (missingQuery.length) skipped(operation, `no observed value for required query: ${missingQuery.join(', ')}`, '.query');
      else await request(operation, `${filled}?${query}`, '.query');
    }
  }
  const summary = {pass: 0, fail: 0, skip: 0, heartbeats, exitCode: 0};
  for (const entry of checks) summary[entry.status.toLowerCase()]++;
  summary.exitCode = unreachable ? 2 : summary.fail ? 1 : 0;
  return {checks, summary};
}

const usage = 'Usage: node tools/conformance.mjs <base-url> [--token T] [--only opId,...] [--skip opId,...] [--json] [--timeout ms]';

async function main(args) {
  try {
    if (!args.length || args[0].startsWith('--')) throw new Error(usage);
    const config = {baseUrl: args[0]};
    let json = false;
    const seen = new Set();
    for (let i = 1; i < args.length; i++) {
      const flag = args[i];
      if (seen.has(flag)) throw new Error(usage);
      seen.add(flag);
      if (flag === '--json') {
        json = true;
        continue;
      }
      if (!['--token', '--only', '--skip', '--timeout'].includes(flag) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(usage);
      const value = args[++i];
      const name = flag.slice(2);
      config[name] = name === 'timeout' ? Number(value) : name === 'only' || name === 'skip' ? value.split(',') : value;
    }
    const result = await walk(config);
    if (json) console.log(JSON.stringify(result));
    else if (result.summary.exitCode === 2) console.error(result.checks.find(entry => entry.status === 'FAIL' && entry.id.endsWith('.request')).detail);
    else {
      for (const entry of result.checks) console.log(`${entry.status} ${entry.operation} ${entry.id}: ${entry.detail}`);
      for (const heartbeat of result.summary.heartbeats) console.log(`INFO streamEvents heartbeat ${heartbeat}`);
      console.log(`Summary: ${result.summary.pass} PASS, ${result.summary.fail} FAIL, ${result.summary.skip} SKIP`);
    }
    return result.summary.exitCode;
  } catch (error) {
    console.error(error.message === usage ? usage : `${error.message}\n${usage}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
