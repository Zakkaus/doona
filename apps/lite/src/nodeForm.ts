export const protocols = ['vmess', 'vless', 'hysteria2', 'ss', 'trojan', 'tuic', 'anytls', 'socks5', 'juicity'] as const;
export type Protocol = (typeof protocols)[number];
export type NodeFields = Record<string, string> & {protocol: Protocol; host: string; port: string; username: string; password: string; name: string};
export type NodeDocument = {original: string; initial: NodeFields; query: string; json?: Record<string, unknown>; tail: string};
const decode64 = (value: string) =>
  new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
const encode64 = (value: string) => btoa(Array.from(new TextEncoder().encode(value), c => String.fromCharCode(c)).join(''));
export function emptyNode(protocol: Protocol = 'vless'): NodeFields {
  return {
    protocol,
    host: '',
    port: '443',
    username: '',
    password: '',
    name: '',
    security: ['vless', 'trojan', 'anytls'].includes(protocol) ? 'tls' : 'none',
    type: 'tcp',
    method: protocol === 'vmess' ? 'auto' : 'aes-128-gcm'
  };
}
const aliases: Record<string, string[]> = {
  sni: ['sni', 'peer'],
  'plugin-opts': ['plugin-opts', 'plugin_opts'],
  insecure: ['allowInsecure', 'allow_insecure', 'insecure'],
  type: ['type', 'network', 'net'],
  serviceName: ['serviceName', 'service_name'],
  transportHost: ['host', 'obfsParam'],
  security: ['security', 'tls'],
  flow: ['flow', 'xtls'],
  pinSHA256: ['pinSHA256', 'pin_sha256'],
  'obfs-password': ['obfs-password', 'obfs_password'],
  ech_config: ['ech_config', 'echconfig']
};
const jsonKeys: Record<string, string> = {
  host: 'add',
  port: 'port',
  username: 'id',
  name: 'ps',
  type: 'net',
  path: 'path',
  transportHost: 'host',
  sni: 'sni',
  method: 'scy',
  security: 'tls',
  alpn: 'alpn',
  mode: 'mode',
  extra: 'extra'
};
export function parseNodeLink(original: string): {document: NodeDocument; fields: NodeFields} {
  const [first, ...chain] = original.trim().split(/\s*->\s*/);
  const scheme = first.match(/^([a-z0-9]+):\/\//i)?.[1].toLowerCase();
  const protocol = ['hy2', 'hysteria'].includes(scheme ?? '') ? 'hysteria2' : scheme;
  if (!protocols.includes(protocol as Protocol)) throw new Error('Unsupported protocol');
  const fields = emptyNode(protocol as Protocol);
  let body = first.slice(first.indexOf('://') + 3);
  const hash = body.lastIndexOf('#');
  fields.name = hash < 0 ? '' : new URLSearchParams('name=' + body.slice(hash + 1).replaceAll('+', '%2B')).get('name')!;
  if (hash >= 0) body = body.slice(0, hash);
  const q = body.indexOf('?');
  const query = q < 0 ? '' : body.slice(q + 1);
  let authority = q < 0 ? body : body.slice(0, q);
  let json: Record<string, unknown> | undefined;
  let rawCredentials = false;
  let encodedAuthority = false;
  if (protocol === 'vmess') {
    const decoded = decode64(authority);
    if (decoded.trimStart().startsWith('{')) {
      json = JSON.parse(decoded);
      for (const [key, source] of Object.entries(jsonKeys))
        if (json![source] !== undefined) fields[key] = typeof json![source] === 'object' ? JSON.stringify(json![source]) : String(json![source]);
      fields.security = json!.tls === 'tls' ? 'tls' : 'none';
      fields.method = String(json!.scy || json!.security || 'auto')
        .trim()
        .toLowerCase();
      if (fields.type === 'grpc') fields.serviceName = fields.path ?? '';
      if (fields.type === 'splithttp') fields.type = 'xhttp';
      fields.type ||= 'tcp';
    } else {
      authority = decoded;
      encodedAuthority = true;
    }
  } else if (['ss', 'vless'].includes(protocol!) && !authority.includes('@') && !authority.includes(':')) {
    try {
      authority = decode64(authority.replace(/\/$/, ''));
    } catch {
      authority = decode64(authority.split('/')[0]);
    }
    rawCredentials = protocol === 'ss';
    encodedAuthority = true;
  }
  if (!json) {
    const at = authority.lastIndexOf('@');
    const endpoint = authority.slice(at + 1).split('/')[0];
    let credentials = at < 0 ? '' : authority.slice(0, at);
    if (protocol === 'ss' && credentials && !credentials.includes(':')) {
      credentials = decode64(credentials);
      rawCredentials = true;
    }
    const colon = credentials.indexOf(':');
    const decode = rawCredentials ? (value: string) => value : decodeURIComponent;
    if (['trojan', 'anytls', 'vless'].includes(protocol!)) {
      const single = decode(colon < 0 ? credentials : credentials.slice(colon + 1));
      if (protocol === 'vless') fields.username = single;
      else fields.password = single;
    } else {
      fields.username = decode(colon < 0 ? credentials : credentials.slice(0, colon));
      fields.password = decode(colon < 0 ? '' : credentials.slice(colon + 1));
    }
    if (protocol === 'ss') {
      fields.method = fields.username;
      try {
        if (!fields.method.includes('-')) fields.method = decode64(fields.method);
      } catch {
        /* Plain cipher names stay as written. */
      }
      fields.username = '';
    }
    if (protocol === 'hysteria2') {
      fields.password = decodeURIComponent(credentials);
      fields.username = '';
    }
    const match = endpoint.match(/^(\[[^\]]+\]|[^:]+)(?::([^/]+))?$/);
    if (!match) throw new Error('Invalid address');
    fields.host = match[1].replace(/^\[|\]$/g, '');
    fields.port = match[2] ?? '443';
    if (protocol === 'hysteria2' && /[,-]/.test(fields.port)) {
      fields.mport = fields.port;
      fields.port = fields.port.split(/[,-]/)[0];
    }
    const params = new URLSearchParams(query);
    // Unknown query options remain in the document, but cannot replace URI credentials.
    for (const [key, value] of params)
      if (!['protocol', 'port', 'username', 'password', 'name', 'method'].includes(key)) fields[key === 'host' ? 'transportHost' : key] = value;
    for (const [key, names] of Object.entries(aliases)) {
      const found = names.find(name => params.get(name));
      if (found) fields[key] = params.get(found)!;
    }
    if (encodedAuthority && ['vmess', 'vless'].includes(protocol!)) {
      if (!params.has('security')) fields.security = params.get('tls') === '1' ? 'tls' : 'none';
      if (params.get('obfs')) fields.type = params.get('obfs') === 'websocket' ? 'ws' : params.get('obfs')!;
      if (fields.type === 'grpc' && !fields.serviceName) fields.serviceName = fields.path ?? '';
    }
    if (['vless', 'trojan'].includes(protocol!)) {
      const security = params.get('security');
      const reality = security === 'reality' || ['pbk', 'sid', 'spx'].some(key => params.has(key));
      fields.security = reality
        ? 'reality'
        : security === 'none' || params.get('tls') === '0'
          ? 'none'
          : security || params.get('tls') === '1' || !encodedAuthority
            ? 'tls'
            : 'none';
    }
    if (!['type', 'network', 'net'].some(key => params.get(key)) && params.get('obfs') && ['vless', 'vmess'].includes(protocol!))
      fields.type = params.get('obfs') === 'websocket' ? 'ws' : params.get('obfs')!;
    if (fields.type === 'grpc' && !fields.serviceName && params.get('obfs') === 'grpc') fields.serviceName = fields.path ?? '';
    if (!params.get('flow') && params.has('xtls')) fields.flow = params.get('xtls') === '2' ? 'xtls-rprx-vision' : '';
    if (fields.insecure !== undefined) fields.insecure = ['true', 'yes', '1', 'on'].includes(fields.insecure.trim().toLowerCase()) ? '1' : '0';
    if (fields.flow === 'xtls-rprx-vision-udp443') fields.flow = 'xtls-rprx-vision';
    if (fields.type === 'splithttp') fields.type = 'xhttp';
    if (protocol === 'ss' && fields.plugin?.includes(';')) {
      const [plugin, ...options] = fields.plugin.split(';');
      fields.plugin = plugin;
      fields['plugin-opts'] ||= options.join(';');
    }
    if (!fields.name) fields.name = params.get('remark') ?? '';
    if (protocol === 'vmess') {
      fields.method = fields.username;
      fields.username = fields.password;
      fields.password = '';
      fields.method =
        params.get('scy') ??
        params.get('encryption') ??
        (['auto', 'aes-128-gcm'].includes(params.get('security') ?? '') ? params.get('security')! : fields.method);
      fields.security = params.get('tls') === '1' || params.get('security') === 'tls' ? 'tls' : 'none';
    }
  }
  if (protocol === 'vmess') fields.method = fields.method.trim().toLowerCase() || 'auto';
  const document = {original, initial: {...fields}, query, json, tail: chain.length ? ` -> ${chain.join(' -> ')}` : ''};
  return {document, fields};
}
export function nodeLink(fields: NodeFields, document?: NodeDocument): string {
  if (document && JSON.stringify(fields) === JSON.stringify(document.initial)) return document.original;
  const same = document?.initial.protocol === fields.protocol;
  if (fields.protocol === 'vmess' && document?.json && same) {
    const json: Record<string, unknown> = same && document?.json ? {...document.json} : {v: '2', aid: '0'};
    for (const [key, target] of Object.entries(jsonKeys)) {
      if (document.initial[key] === fields[key]) continue;
      json[target] =
        key === 'security' ? (fields.security === 'tls' ? 'tls' : '') : key === 'extra' && fields.extra ? JSON.parse(fields.extra) : (fields[key] ?? '');
    }
    if (fields.method !== document.initial.method) delete json.security;
    if (fields.serviceName !== document.initial.serviceName && fields.type === 'grpc') json.path = fields.serviceName;
    return `vmess://${encode64(JSON.stringify(json))}${same ? (document?.tail ?? '') : ''}`;
  }
  const params = new URLSearchParams(same ? document?.query : '');
  const core = new Set(['protocol', 'host', 'port', 'username', 'password', 'name', 'method']);
  for (const [key, value] of Object.entries(fields)) {
    if (core.has(key) || (same && document?.initial[key] === value)) continue;
    for (const alias of aliases[key] ?? [key]) params.delete(alias === 'transportHost' ? 'host' : alias);
    if (key === 'type' && ['vmess', 'vless'].includes(fields.protocol)) params.delete('obfs');
    if (value) params.set(key === 'transportHost' ? 'host' : key, value);
  }
  if (fields.protocol === 'ss' && (!same || fields['plugin-opts'] !== document?.initial['plugin-opts'])) {
    if (fields.plugin) params.set('plugin', fields.plugin);
    else params.delete('plugin');
  }
  if (!['vmess', 'vless', 'trojan'].includes(fields.protocol)) {
    params.delete('security');
    params.delete('type');
  }
  if (fields.protocol === 'vless' && !params.has('encryption')) params.set('encryption', 'none');
  if (fields.protocol === 'vmess' && (!same || fields.method !== document?.initial.method)) {
    params.delete('encryption');
    if (params.has('security') && !['none', 'tls'].includes(params.get('security')!)) params.delete('security');
    params.set('scy', fields.method);
  }
  if (fields.mport && (!same || fields.mport !== document?.initial.mport || /[:,]/.test(document?.original.split('?')[0] ?? '')))
    params.set('mport', fields.mport);
  const enc = encodeURIComponent;
  const auth =
    fields.protocol === 'ss'
      ? encode64(`${fields.method}:${fields.password}`)
      : ['trojan', 'anytls', 'hysteria2'].includes(fields.protocol)
        ? enc(fields.password)
        : `${enc(fields.username)}${fields.password ? `:${enc(fields.password)}` : ''}`;
  const host = fields.host.includes(':') ? `[${fields.host.replace(/^\[|\]$/g, '')}]` : fields.host;
  const authority =
    fields.protocol === 'vmess' ? encode64(`${fields.method}:${fields.username}@${host}:${fields.port}`) : `${auth ? `${auth}@` : ''}${host}:${fields.port}`;
  return `${fields.protocol}://${authority}${params.size ? `?${params}` : ''}${fields.name ? `#${enc(fields.name)}` : ''}${same ? (document?.tail ?? '') : ''}`;
}
