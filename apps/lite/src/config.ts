import type {ConfigSource, Node} from '../../../src/api/model';
import {sha256} from '../../../src/api/hash';
import {validationSources} from '../../../src/dae/sources';
import {isNodeLink, readNodeEntries} from '../../../src/dae/nodes';
import {isQuotable, quote, scanConfig} from '../../../src/dae/text';
import {LiteError, readMain, readProviders, type Connection} from './api';

export const canWrite = (connection: Connection, source?: ConfigSource) =>
  connection.capabilities.resources.config.writable === true &&
  connection.capabilities.resources.operations.available &&
  connection.capabilities.resources.config_validate.available &&
  connection.capabilities.resources.config_validate.modes?.includes('full') === true &&
  source?.writable === true;
const nodeSnapshots = new WeakMap<Connection['api'], Node[]>();
export const nodeSnapshot = (api: Connection['api']) => nodeSnapshots.get(api);

export async function readNodes(connection: Connection, signal?: AbortSignal) {
  const nodes: Node[] = [];
  let cursor: string | undefined;
  do {
    const page = await connection.api.nodes({limit: 1000, cursor}, signal);
    nodes.push(...page.nodes);
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  nodeSnapshots.set(connection.api, nodes);
  return nodes;
}
export async function readNodePage(connection: Connection, signal?: AbortSignal) {
  const {api, capabilities} = connection;
  const [nodes, source, config, providers] = await Promise.all([
    readNodes(connection, signal),
    capabilities.resources.config.available ? readMain(api, signal) : undefined,
    capabilities.resources.config.available ? api.config(signal) : undefined,
    capabilities.resources.providers.available ? readProviders(api, signal) : []
  ]);
  return {nodes, source, config, providers};
}
export async function validateContent(connection: Connection, source: ConfigSource, content: string) {
  const config = await connection.api.config();
  const current = config.sources.find(item => item.id === source.id);
  if (!current || current.content_sha256 !== source.content_sha256) throw new LiteError('conflict');
  if ((await sha256(source.content)) !== source.content_sha256) throw new LiteError('incomplete');
  const capability = connection.capabilities.resources.config_validate;
  if (!capability.available || !capability.modes?.includes('full')) throw new LiteError('validationUnavailable');
  const sources = validationSources(config.sources, {id: source.id, content});
  if (!sources) throw new LiteError('incomplete');
  const request = {sources, mode: 'full' as const};
  const bytes = new TextEncoder();
  if (
    sources.reduce((n, item) => n + bytes.encode(item.content).length, 0) > (capability.max_bytes ?? Infinity) ||
    bytes.encode(JSON.stringify(request)).length > connection.capabilities.limits.max_json_body_bytes
  )
    throw new LiteError('tooLarge');
  const result = await connection.api.validateConfig(request);
  if (!result.valid)
    throw new LiteError(
      result.diagnostics.some(item => item.code === 'restart-required') ? 'restartRequired' : 'invalidConfig',
      result.diagnostics
        .filter(item => item.level === 'error')
        .map(item => `${item.line ?? ''}: ${item.message}`)
        .join('\n')
    );
  return result;
}
export function appendEntry(text: string, section: string, entry: string) {
  const block = scanConfig(text)
    .blocks.filter(block => block.name === section)
    .at(-1);
  if (!block) return `${text.trimEnd()}\n\n${section} {\n  ${entry}\n}\n`;
  const line = text.lastIndexOf('\n', block.close - 1) + 1;
  const at = /^[ \t]*$/.test(text.slice(line, block.close)) ? line : block.close;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return text.slice(0, at) + (text[at - 1] === '\n' ? '' : eol) + `  ${entry}${eol}` + text.slice(at);
}
export function removeEntry(text: string, entry: {from: number; to: number}) {
  return text.slice(0, entry.from) + text.slice(entry.to);
}
export function linkInfo(link: string) {
  try {
    const decode = (value: string) => new TextDecoder().decode(Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0)));
    let url = new URL(link);
    if (url.protocol === 'vmess:') {
      const data = JSON.parse(decode(link.slice(8).split('#')[0]));
      return {name: String(data.ps || data.add || ''), address: `${data.add}:${data.port}`, protocol: 'vmess'};
    }
    const name = decodeURIComponent(url.hash.slice(1));
    if (url.protocol === 'ssr:') return {name, address: '', protocol: 'ssr'};
    if (url.protocol === 'ss:' && !link.split('#')[0].includes('@')) url = new URL(`ss://${decode(link.slice(5).split(/[?#]/)[0])}`);
    return {name: name || url.hostname, address: url.host, protocol: url.protocol.slice(0, -1)};
  } catch {
    return {name: '', address: '', protocol: link.split(':')[0]};
  }
}
export type ImportRow = {link: string; name: string; valid: boolean};
export async function inspectLinks(connection: Connection, source: ConfigSource, input: string): Promise<ImportRow[]> {
  const capability = connection.capabilities.resources.config_validate;
  if (!capability.available || !capability.modes?.includes('syntax')) throw new LiteError('validationUnavailable');
  const used = new Set([...readNodeEntries(source.content).map(item => item.name), ...(await readNodes(connection)).map(item => item.name)]);
  const rows: ImportRow[] = [];
  for (const [index, link] of input
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .entries()) {
    const base = linkInfo(link).name || `node-${index + 1}`;
    let name = base;
    let suffix = 2;
    while (used.has(name)) name = `${base}-${suffix++}`;
    used.add(name);
    let valid = false;
    if (isNodeLink(link) && isQuotable(link) && isQuotable(name)) {
      const result = await connection.api.validateConfig({mode: 'syntax', sources: [{id: 'node', content: `node {\n  ${quote(name)}: ${quote(link)}\n}\n`}]});
      valid = result.valid && !result.diagnostics.some(item => item.level === 'error' || (item.level === 'warning' && !item.code.startsWith('legacy-')));
    }
    rows.push({link, name, valid});
  }
  return rows;
}

export function sectionText(text: string, name: string): string {
  const blocks = scanConfig(text).blocks.filter(item => item.name === name);
  return blocks[0] ? text.slice(blocks[0].from, blocks[0].to) : `${name} {\n}\n`;
}
export function writeSection(text: string, name: string, section: string): string {
  const blocks = scanConfig(text).blocks.filter(item => item.name === name);
  const candidate = scanConfig(section).blocks;
  if (
    blocks.length > 1 ||
    candidate.length !== 1 ||
    candidate[0].name !== name ||
    candidate[0].close >= section.length ||
    section.slice(0, candidate[0].from).trim() ||
    section.slice(candidate[0].to).trim()
  )
    throw new LiteError('invalidConfig');
  return blocks[0] ? text.slice(0, blocks[0].from) + section + text.slice(blocks[0].to) : text.trimEnd() + '\n\n' + section + '\n';
}
