import {describe, expect, it} from 'vitest';
import type {ConfigSource, Node, Provider} from '../../api/model';
import {readSubscriptionEntries} from '../../dae/subscriptions';
import {
  nodeFormReason,
  editableSource,
  declaredInInclude,
  subscriptionPlace,
  nodeEditState,
  subscriptionRemoval,
  nodeRows,
  nodeSource,
  ownedNodes,
  providerRows,
  nodeRowView,
  probeKindLines,
  providerRowView,
  keptOptions,
  providerCreate,
  providerChanges,
  renameReferences,
  selectedProvider,
  joinableGroups
} from './view';
import {translate, type Translator} from '../../i18n';
import {readNodeEntries} from '../../dae/nodes';
import {createMockApi} from '../../../mock';
import {nodeFixtures} from '../../../mock/fixtures';
import {formatBytes} from '../../i18n/format';
const contains = (value: string, query: string) => value.toLowerCase().includes(query.toLowerCase());
const t: Translator = (key, params) => translate('en', key, params);

const provider = (id: string, overrides: Partial<Provider> = {}): Provider => ({
  id,
  name: `opaque-${id}`,
  kind: 'subscription',
  url_redacted: null,
  node_count: 0,
  updated_at: null,
  expires_at: null,
  traffic: null,
  status: 'stale',
  last_error: null,
  ...overrides
});
const node = (name: string, overrides: Partial<Node> = {}): Node => ({
  id: name,
  name,
  protocol: 'vless',
  subscription_tag: null,
  provider_id: null,
  group_ids: [],
  health: [],
  ...overrides
});

const entries = readSubscriptionEntries(`subscription {
  primary: 'https://primary.example/sub'
  secondary: 'https://secondary.example/sub'
  spare: 'https://spare.example/sub'
}`);

describe('providerRows', () => {
  it('prefers node tags over URL hosts, then matches a unique host and the sole unclaimed entry', () => {
    const providers = [
      provider('a', {url_redacted: 'https://secondary.example/redacted'}),
      provider('b', {url_redacted: 'https://secondary.example/redacted'}),
      provider('c', {url_redacted: 'not a URL'}),
      provider('file', {kind: 'file', url_redacted: 'https://primary.example/redacted'})
    ];
    const nodes = [node('tagged', {provider_id: 'a', subscription_tag: 'primary'})];
    const rows = providerRows(providers, nodes, entries, t).list;
    expect(rows.map(item => item.displayName)).toEqual(['primary', 'secondary', 'spare', 'opaque-file']);
    expect(providers.map(item => item.name)).toEqual(['opaque-a', 'opaque-b', 'opaque-c', 'opaque-file']);
  });

  it('does not guess between duplicate hosts or multiple unclaimed subscriptions', () => {
    const shared = readSubscriptionEntries(`subscription {
      first: 'https://shared.example/one'
      second: 'https://shared.example/two'
    }`);
    expect(providerRows([provider('a', {url_redacted: 'https://shared.example/redacted'})], [], shared, t).list[0].name).toBe('opaque-a');
    expect(providerRows([provider('a'), provider('b')], [], entries.slice(0, 1), t).list.map(item => item.name)).toEqual(['opaque-a', 'opaque-b']);
  });

  it('groups null and omitted provider ids as unattributed provenance', () => {
    const remote = provider('remote');
    const nodes = [node('local'), node('remote', {provider_id: 'remote'}), node('unknown', {provider_id: undefined})];
    const result = providerRows([remote], nodes, [], t);
    expect(result.list.map(item => [item.id, item.name, item.kind, item.node_count])).toEqual([
      ['unattributed', t('nodes.kind.unattributed'), 'unattributed', 2],
      ['remote', 'opaque-remote', 'subscription', 0]
    ]);
    expect(ownedNodes(nodes, null).map(item => item.id)).toEqual(['local', 'unknown']);
  });

  it('does not attribute unknown nodes to a backend inline provider', () => {
    const inline = provider('backend-inline', {kind: 'inline', name: 'config.dae', node_count: 2});
    const nodes = [node('local'), node('owned', {provider_id: inline.id})];
    expect(providerRows([inline], nodes, [], t).list.map(item => item.kind)).toEqual(['unattributed', 'inline']);
    expect(ownedNodes(nodes, inline.id).map(item => item.id)).toEqual(['owned']);
  });
});

describe('node rows', () => {
  it('names the source row each node is listed under', () => {
    const remote = provider('remote');
    const nodes = [node('local'), node('remote', {provider_id: 'remote'}), node('direct', {protocol: 'direct'})];
    const {list} = providerRows([remote], nodes, [], t);
    const sourceOf = nodeSource(list, [remote]);
    expect(nodes.map(sourceOf)).toEqual([t('nodes.kind.unattributed'), 'opaque-remote', t('nodes.kind.builtin')]);
    expect(sourceOf(node('gone', {provider_id: 'gone'}))).toBe('—');
  });

  it('distinguishes no filter, unknown provenance, and backend provider ownership', () => {
    const nodes = [node('local'), node('owned', {provider_id: 'backend-inline'}), node('unknown', {provider_id: undefined})];
    expect(ownedNodes(nodes, undefined).map(item => item.id)).toEqual(['local', 'owned', 'unknown']);
    expect(ownedNodes(nodes, null).map(item => item.id)).toEqual(['local', 'unknown']);
    expect(ownedNodes(nodes, 'backend-inline').map(item => item.id)).toEqual(['owned']);
  });

  it('combines trimmed case-insensitive search, group and protocol filters without reordering its input', () => {
    const nodes = [
      node('HK-10', {group_ids: ['gaming']}),
      node('hk-2', {group_ids: ['gaming']}),
      node('hk-1'),
      node('hk-3', {group_ids: ['gaming'], protocol: 'trojan'}),
      node('sg-1', {group_ids: ['gaming']})
    ];
    expect(nodeRows(nodes, ' HK- ', 'gaming', 'vless', {column: 'name', direction: 'ascending'}, contains, 'en-US').map(item => item.id)).toEqual([
      'hk-2',
      'HK-10'
    ]);
    expect(nodes.map(item => item.id)).toEqual(['HK-10', 'hk-2', 'hk-1', 'hk-3', 'sg-1']);
    expect(nodeRows(nodes, '', '', '', {column: 'protocol', direction: 'ascending'}, contains, 'en-US').map(item => item.id)).toEqual([
      'hk-3',
      'HK-10',
      'hk-2',
      'hk-1',
      'sg-1'
    ]);
  });

  it('sorts measured latency before missing health and breaks ties by name in either direction', () => {
    const sample = {
      transport: 'tcp',
      purpose: 'data',
      ip_version: 'ipv4',
      warmth: 'warm',
      measurement: 'tcp_connect',
      sample_source: 'probe',
      state: 'healthy',
      latency_ms: 20,
      moving_avg_ms: null,
      avg10_ms: null,
      observed_at: '2026-01-01T00:00:00Z',
      error: null
    } satisfies Node['health'][number];
    const nodes = [
      node('slow-10', {health: [sample]}),
      node('missing'),
      node('slow-2', {health: [sample]}),
      node('zero', {health: [{...sample, latency_ms: 0}]}),
      node('unavailable', {health: [{...sample, state: 'unavailable', latency_ms: 1}]})
    ];
    const ascending = ['zero', 'slow-2', 'slow-10', 'missing', 'unavailable'];
    expect(nodeRows(nodes, '', '', '', {column: 'latency', direction: 'ascending'}, contains, 'en-US').map(item => item.id)).toEqual(ascending);
    expect(nodeRows(nodes, '', '', '', {column: 'latency', direction: 'descending'}, contains, 'en-US').map(item => item.id)).toEqual([...ascending].reverse());
  });
});

it('projects node protocol, membership, measured zero and unavailable health', () => {
  const sample = nodeFixtures(0).nodes[0].health.find(item => item.transport === 'tcp')!;
  const view = nodeRowView(
    node('a', {protocol: null, group_ids: ['group', 'unknown'], health: [{...sample, latency_ms: 0}]}),
    new Map([['group', 'Proxy']]),
    'en',
    t
  );
  expect(view.protocol).toBe('—');
  expect(view.groups).toContain('Proxy');
  expect(view.groups).toContain('unknown');
  expect(view.latency).toBe('0 ms');
  expect(nodeRowView(node('down', {health: [{...sample, state: 'unavailable'}]}), new Map(), 'en', t).latency).toBe(t('ui.unavailable'));
});

const probe = (overrides: Partial<Node['health'][number]>): Node['health'][number] => ({
  transport: 'tcp',
  purpose: 'data',
  ip_version: 'ipv4',
  warmth: 'warm',
  measurement: 'tcp_connect',
  sample_source: 'probe',
  state: 'healthy',
  latency_ms: 40,
  moving_avg_ms: null,
  avg10_ms: null,
  observed_at: '2026-01-01T00:00:00Z',
  error: null,
  ...overrides
});
const down = {state: 'unavailable', latency_ms: null} as const;
it.each([
  ['no results', [], []],
  ...(['dns_round_trip', 'quic_handshake'] as const).map(
    measurement =>
      [
        `a newer ${measurement} failure replaces an older success`,
        [
          probe({transport: 'udp', purpose: measurement === 'dns_round_trip' ? 'dns' : 'data', measurement}),
          probe({transport: 'udp', purpose: measurement === 'dns_round_trip' ? 'dns' : 'data', measurement, observed_at: '2026-01-01T00:01:00Z', ...down})
        ],
        [[measurement === 'dns_round_trip' ? 'DNS' : 'UDP', 'Unavailable']]
      ] as const
  ),
  [
    'HTTP headers preferred over a round trip at equal warmth',
    [probe({measurement: 'http_round_trip'}), probe({measurement: 'http_headers', ...down})],
    [['HTTP', 'Unavailable']]
  ],
  [
    'one line per kind in a fixed order',
    [probe({transport: 'udp', purpose: 'dns', measurement: 'dns_round_trip', latency_ms: 30}), probe({measurement: 'http_headers', latency_ms: 50}), probe({})],
    [
      ['TCP', '40 ms'],
      ['HTTP', '50 ms'],
      ['DNS', '30 ms']
    ]
  ],
  [
    'a failed probe by its reason, unavailable without one, unknown as a dash',
    [
      probe({transport: 'udp', measurement: 'quic_handshake', ...down, error: 'probe_failed'}),
      probe({...down}),
      probe({transport: 'udp', purpose: 'dns', state: 'unknown', latency_ms: null})
    ],
    [
      ['TCP', 'Unavailable'],
      ['UDP', 'The probe failed'],
      ['DNS', '—']
    ]
  ],
  [
    'the IPv4 and IPv6 rows folded, the warmest sample kept',
    [probe({...down}), probe({ip_version: 'ipv6', latency_ms: 70}), probe({warmth: 'cold', latency_ms: 10})],
    [['TCP', '70 ms']]
  ],
  [
    'one kind over both transports named by transport',
    [
      probe({purpose: 'dns', measurement: 'dns_round_trip', latency_ms: 60}),
      probe({transport: 'udp', purpose: 'dns', measurement: 'dns_round_trip', latency_ms: 30})
    ],
    [
      ['DNS (TCP)', '60 ms'],
      ['DNS (UDP)', '30 ms']
    ]
  ]
] as const)('lists probe kinds: %s', (_, health, lines) => {
  for (const rows of [[...health], [...health].reverse()]) expect(probeKindLines({health: rows}, t).map(line => [line.label, line.value])).toEqual(lines);
});

it.each([
  [probe({latency_ms: 0}), '0 ms', 'ms ok'],
  [probe({latency_ms: null}), '—', 'ms'],
  [probe({state: 'unknown'}), '—', 'ms'],
  [probe({...down, error: 'probe_failed'}), 'Unavailable', 'ms err']
] as const)('preserves the latency row for %j', (health, latency, latencyClass) => {
  expect(nodeRowView(node('a', {health: [health]}), new Map(), 'en', t)).toMatchObject({latency, latencyClass});
});

it.each([
  ['no kinds', [], false],
  ['a single kind', [probe({}), probe({ip_version: 'ipv6'})], false],
  ['two kinds', [probe({}), probe({transport: 'udp', measurement: 'quic_handshake'})], true]
] as const)('shows the probe-kinds section for %s', (_, health, visible) => {
  expect(nodeRowView(node('a', {health: [...health]}), new Map(), 'en', t).showProbeKinds).toBe(visible);
});

it.each([
  ['an allowance', {upload_bytes: '100', download_bytes: '700', total_bytes: '1000'}, {pct: 80, tone: 'warn'}],
  ['no allowance', {upload_bytes: '1', download_bytes: '1', total_bytes: null}, null],
  ['a zero allowance', {upload_bytes: '1', download_bytes: '1', total_bytes: '0'}, null],
  ['unknown usage', {upload_bytes: null, download_bytes: '1', total_bytes: '1000'}, null],
  ['no traffic', null, null]
] as const)('gives a meter share for %s', (_, traffic, quota) => {
  expect(providerRowView(provider('a', {traffic}), undefined, 'en-US', t).quota).toEqual(quota);
});

it('projects traffic without truncating counters and retains custom refresh intervals', () => {
  const row = providerRowView(provider('a', {traffic: {upload_bytes: '1', download_bytes: '1023', total_bytes: null}}), 90, 'en-US', t);
  expect(row.usage).toBe(formatBytes(1024n, 'en'));
  expect(row.interval).toBe(t('nodes.everyDuration', {duration: '1 min'}));
  expect(providerRowView({...provider('unattributed'), kind: 'unattributed'}, undefined, 'en-US', t)).toMatchObject({
    usage: '—',
    status: null,
    expires: '—'
  });
});

it('separates built-in outbounds from unattributed nodes and avoids provider id collisions', () => {
  const nodes = [
    node('direct', {protocol: 'direct'}),
    node('block', {protocol: 'block', provider_id: undefined}),
    node('loose'),
    node('owned-direct', {protocol: 'direct', provider_id: 'builtin'})
  ];
  const rows = providerRows([provider('builtin')], nodes, [], t).list;
  expect(rows.map(row => [row.id, row.kind, row.node_count])).toEqual([
    ['builtin-', 'builtin', 2],
    ['unattributed', 'unattributed', 1],
    ['builtin', 'subscription', 0]
  ]);
  expect(ownedNodes(nodes, null, 'builtin').map(row => row.id)).toEqual(['direct', 'block']);
  expect(ownedNodes(nodes, null, 'unattributed').map(row => row.id)).toEqual(['loose']);
  expect(ownedNodes(nodes, 'builtin').map(row => row.id)).toEqual(['owned-direct']);
  expect(providerRowView(rows[0], undefined, 'en-US', t)).toMatchObject({
    name: t('nodes.kind.builtin'),
    kind: t('nodes.kind.builtin'),
    usage: '—',
    updatedAt: null,
    status: null
  });
});

it('shows an unspecified interval without claiming a default', () => {
  expect(providerRowView(provider('a'), undefined, 'en-US', t).interval).toBe('—');
  expect(providerRowView(provider('a'), null, 'en-US', t).interval).toBe('—');
});

it('lists as written only the options without their own control', () => {
  const options = [
    {name: 'ua', value: "'clash.meta'"},
    {name: 'interval', value: '0s'},
    {name: 'cache', value: 'true'},
    {name: 'download_detour', value: 'proxy'},
    {name: 'retry', value: '3'}
  ];
  expect(keptOptions(options, {cache: true, route: true})).toEqual([{name: 'retry', value: '3'}]);
  expect(keptOptions(options, {cache: false, route: false})).toEqual([
    {name: 'cache', value: 'true'},
    {name: 'download_detour', value: 'proxy'},
    {name: 'retry', value: '3'}
  ]);
});

describe('providerCreate', () => {
  const form = {name: ' sub-a ', value: ' https://example.org/sub ', interval: '', agent: '', cache: null, route: ''};
  const options = {update_interval: 86400, user_agent: 'honk/1.0', cache: true};

  it('sends only the options that differ from the backend default', () => {
    const base = {name: 'sub-a', kind: 'subscription', url: 'https://example.org/sub'};
    expect(providerCreate(form, options)).toEqual(base);
    expect(providerCreate({...form, interval: '86400', agent: ' honk/1.0 ', cache: true}, options)).toEqual(base);
    expect(providerCreate({...form, interval: '0', agent: ' clash.meta ', cache: false}, options)).toEqual({
      ...base,
      update_interval: 0,
      user_agent: 'clash.meta',
      cache: false
    });
  });

  it('never sends an option the backend does not list', () => {
    const chosen = {...form, interval: '3600', agent: 'clash.meta', cache: false};
    expect(providerCreate(chosen, undefined)).toEqual({name: 'sub-a', kind: 'subscription', url: 'https://example.org/sub'});
    expect(providerCreate(chosen, {user_agent: 'honk/1.0'})).toEqual({
      name: 'sub-a',
      kind: 'subscription',
      url: 'https://example.org/sub',
      user_agent: 'clash.meta'
    });
  });

  it('sends a typed interval in seconds when it differs from the default', () => {
    expect(providerCreate({...form, interval: '90m'}, {update_interval: 86400}).update_interval).toBe(5400);
    expect(providerCreate({...form, interval: '24h'}, {update_interval: 86400}).update_interval).toBeUndefined();
    expect(providerCreate({...form, interval: 'h'}, {update_interval: 86400}).update_interval).toBeUndefined();
  });
});

it('falls back to the first real source when the linked provider is no longer listed', () => {
  const {list} = providerRows([provider('a'), provider('b')], [], [], t);
  expect(selectedProvider(list, 'b')).toBe('b');
  expect(selectedProvider(list, 'gone')).toBe('a');
});

it('says why the add dialog cannot submit, first applicable, and nothing while it is still empty', () => {
  expect(nodeFormReason('provider', '', '', t)).toBeNull();
  expect(nodeFormReason('provider', '', 'https://example.org/sub', t)).toBe('Enter a name');
  expect(nodeFormReason('provider', 'sub a', 'ftp://x', t)).toBe(t('nodes.nameInvalid'));
  expect(nodeFormReason('provider', 'sub-a', 'ftp://x', t)).toBe(t('nodes.urlInvalid'));
  expect(nodeFormReason('provider', 'sub-a', 'https://example.org/sub', t)).toBeNull();
  expect(nodeFormReason('node', 'hk-03', 'vless:/broken', t)).toBe('The node link must look like vless://…');
  expect(nodeFormReason('node', 'hk 03', 'vless://id@host:443', t)).toBeNull();
  // A group name's problem is shown at its field.
  expect(nodeFormReason('group', 'bad name', '', t)).toBeNull();
});

it('a subscription is matched to its entry by its name, before any node is fetched', () => {
  const {list} = providerRows([provider('a', {name: 'primary'}), provider('file', {kind: 'file'})], [], entries, t);
  expect(list.map(item => item.sourceTag)).toEqual(['primary', undefined]);
});

it('a rename finds the groups naming the tag in the declaring source and every other source', () => {
  const source = (id: string, content: string) => ({id, content}) as ConfigSource;
  const main = source('main', `subscription {\n  harbor: 'https://a.example/sub'\n}\ngroup {\n  here { filter: subtag(harbor)\n policy: min }\n}`);
  const other = source('other', `group {\n  there { filter: subtag(harbor)\n policy: min }\n}`);
  const unrelated = source('unrelated', `group {\n  loose { filter: subtag(sub-d)\n policy: min }\n}`);
  expect(renameReferences([main, unrelated], main, 'harbor')).toEqual({here: ['here'], elsewhere: []});
  expect(renameReferences([main, other, unrelated], main, 'harbor')).toEqual({here: ['here'], elsewhere: [other]});
});

it('a rename is blocked by a filter that names the tag inside an expression, in any source', () => {
  const source = (id: string, content: string) => ({id, content}) as ConfigSource;
  const sub = `subscription {\n  harbor: 'https://a.example/sub'\n}\n`;
  const compound = source('main', sub + `group {\n  hk { filter: subtag(harbor) && name(keyword: HK)\n policy: min }\n}`);
  const negated = source('main', sub + `group {\n  rest { filter: !subtag(harbor)\n policy: min }\n}`);
  const other = source('other', `group {\n  there { filter: subtag(sub-d) && !subtag('harbor')\n policy: min }\n}`);
  const loose = source('loose', `group {\n  near { filter: subtag(harborc) && name(keyword: sub)\n policy: min }\n}`);
  expect(renameReferences([compound], compound, 'harbor').elsewhere).toEqual([compound]);
  expect(renameReferences([negated], negated, 'harbor').elsewhere).toEqual([negated]);
  expect(renameReferences([negated, other, loose], negated, 'harbor').elsewhere).toEqual([negated, other]);
});

it('tells a subscription never fetched apart from one holding older data', () => {
  expect(providerRowView(provider('a'), undefined, 'en-US', t)).toMatchObject({status: 'Not fetched', tone: 'neutral'});
  expect(providerRowView(provider('a', {updated_at: '2026-09-30T00:00:00Z'}), undefined, 'en-US', t)).toMatchObject({
    status: 'Stale',
    tone: 'warn'
  });
  const failed = provider('a', {last_error: {code: 'fetch_failed', message: 'HTTP 502', details: null}});
  expect(providerRowView(failed, undefined, 'en-US', t)).toMatchObject({status: 'Stale', tone: 'warn'});
  expect(providerRowView(provider('a', {status: 'error'}), undefined, 'en-US', t)).toMatchObject({status: 'Failed'});
  expect(providerRowView(provider('f', {kind: 'file'}), undefined, 'en-US', t)).toMatchObject({status: 'Stale'});
});

it('uses a unique verified node tag for the interval without authorizing guesses', () => {
  const entries = readSubscriptionEntries("subscription {\n primary: {\n url: 'https://primary.example/sub'\n interval: 1h\n }\n}\n");
  const tagged = node('tagged', {provider_id: 'a', subscription_tag: 'primary'});
  expect(providerRows([provider('a')], [tagged], [...entries, ...entries], t).list[0].configTag).toBeUndefined();
  for (const tags of [['primary'], ['primary', 'secondary'], []]) {
    const nodes = tags.map((tag, index) => node(String(index), {provider_id: 'a', subscription_tag: tag}));
    const [row] = providerRows([provider('a')], nodes, entries, t).list;
    expect(row.configTag ?? row.sourceTag).toBe(tags.length === 1 ? 'primary' : 'opaque-a');
  }
});

const config = await createMockApi().config();
const main = config.sources.find(source => source.kind === 'main')!;
const [entry] = readNodeEntries(main.content);
const form = {name: entry.name, value: entry.link, interval: '', agent: '', cache: null, route: ''};

it.each(['filter: name(hk-01)', 'default: hk-01', 'final: hk-01'])('blocks a cross-source rename through %s but allows a link edit', reference => {
  const other = {...main, id: 'other', kind: 'include' as const, content: `group {\n other {\n ${reference}\n policy: random\n }\n}\n`};
  expect(nodeEditState([main, other], main, entry, [], {...form, name: 'changed'}, t)).toMatchObject({valid: false, error: t('nodes.renameElsewhere')});
  expect(nodeEditState([main, other], main, entry, [], {...form, value: 'socks5://127.0.0.1:1080'}, t)).toMatchObject({valid: true, error: null});
});

it.each(['hk-01', "'hk-01'"])('blocks a cross-source DNS detour rename through %s but allows a link edit', target => {
  const other = {...main, id: 'dns', kind: 'include' as const, content: `dns {\n upstream {\n remote: 'tcp://1.1.1.1:53' -> ${target}\n }\n}\n`};
  expect(nodeEditState([main, other], main, entry, [], {...form, name: 'changed'}, t)).toMatchObject({valid: false, error: t('nodes.renameElsewhere')});
  expect(nodeEditState([main, other], main, entry, [], {...form, value: 'socks5://127.0.0.1:1080'}, t)).toMatchObject({valid: true, error: null});
  expect(
    nodeEditState([main, {...other, content: other.content.replace(`-> ${target}`, '-> hk-010')}], main, entry, [], {...form, name: 'changed'}, t).valid
  ).toBe(true);
});

it('assigns duplicate names to the name field and validates links and unchanged drafts', () => {
  for (const nodes of [[], [node('hk-02')]]) {
    expect(nodeEditState([main], main, entry, nodes, {...form, name: 'hk-02'}, t)).toMatchObject({valid: false, nameError: t('nodes.nameTaken')});
  }
  for (const patch of [{}, {name: ''}, {name: "can't"}, {value: 'vless:/broken'}, {value: "socks5://host:1080#can't"}])
    expect(nodeEditState([main], main, entry, [], {...form, ...patch}, t).valid).toBe(false);
  expect(nodeEditState([main], main, entry, [], {...form, name: 'edge one'}, t)).toMatchObject({valid: true, nameError: null});
});

it.each([
  [true, true, true, true, true],
  [false, true, true, true, false],
  [true, false, true, true, false],
  [true, true, false, true, false],
  [true, true, true, false, false],
  [true, true, true, null, false],
  [true, true, true, undefined, false]
] as const)('permits editing only complete writable authored text (%s, %s, %s, %s)', (daeText, canWrite, writable, complete, expected) => {
  expect(editableSource(daeText, canWrite, {...main, writable}, complete)).toBe(expected);
});

it.each([
  ['main and a writable include', true, true, true, false, ['hk', 'jp']],
  ['a read-only include', true, false, true, false, ['hk']],
  ['an incomplete include', true, true, false, false, ['hk']],
  ['an include being written', true, true, true, true, ['hk']],
  ['a read-only main', false, true, true, false, ['jp']]
])('offers the groups of every writable, complete, idle source to join: %s', (_, mainWritable, includeWritable, complete, busy, expected) => {
  const at = (id: string, kind: 'main' | 'include', writable: boolean, group: string) => ({
    ...main,
    id,
    kind,
    writable,
    content: `group {\n    ${group} {\n        policy: min\n    }\n}\n`
  });
  // A group declared twice is ambiguous and never offered.
  const sources = [
    at('main', 'main', mainWritable, 'hk'),
    at('inc', 'include', includeWritable, 'jp'),
    at('a', 'include', true, 'tw'),
    at('b', 'include', true, 'tw')
  ];
  const joinable = joinableGroups(
    sources,
    source => source.id !== 'inc' || complete,
    source => source.id === 'inc' && busy
  );
  expect(joinable.map(entry => entry.name)).toEqual(expected);
});

it.each([
  [[], false],
  [['main'], false],
  [['main', 'include'], true],
  [['include'], true],
  [['include', 'include'], true]
] as const)('refuses removal when any non-main source declares it (%j)', (kinds, expected) => {
  expect(declaredInInclude(kinds.map(kind => ({source: {...main, kind}})))).toBe(expected);
});

it('locates the declaring subscription and opens ambiguous names without editing', () => {
  const [entry] = readSubscriptionEntries(main.content);
  const item = {...provider('harbor', {name: entry.tag, url_redacted: entry.url}), sourceTag: entry.tag};
  const place = {source: main, entry};
  expect(subscriptionPlace([], item, [item])).toBeNull();
  expect(subscriptionPlace([place], item, [item])).toEqual({...place, unique: true});
  expect(subscriptionPlace([place], item, [item, {...item, id: 'duplicate'}])?.unique).toBe(false);
  const other = {source: {...main, id: 'other'}, entry: {...entry, url: 'https://other.example/sub'}};
  expect(subscriptionPlace([other, place], item, [item])).toEqual({...place, unique: false});
});

it('blocks subscription removal across sources and waits for the first config read', () => {
  const item = provider('harbor', {name: 'harbor'});
  const other = {...main, id: 'other', content: 'group {\n travel { filter: subtag(harbor) && !name(keyword: HK) policy: min }\n}\n'};
  expect(subscriptionRemoval([main, other], false, item)).toEqual({blockers: ['backup', 'travel'], checking: false});
  expect(subscriptionRemoval(undefined, true, item)).toEqual({blockers: [], checking: true});
  expect(subscriptionRemoval([main], true, item).checking).toBe(false);
  expect(subscriptionRemoval([main], false, {...item, name: 'unused'}).blockers).toEqual([]);
  expect(subscriptionRemoval([main], false, {...item, kind: 'file'}).blockers).toEqual([]);
});

it.each([
  ['', false],
  ['3600', false],
  ['1h', false],
  ['+1h', false],
  ['60m', false],
  ['0', true],
  ['2h', true],
  ['h', true],
  ['-1h', true]
] as const)('guards only changed subscription intervals (%s)', (interval, edited) => {
  const entry = readSubscriptionEntries("subscription {\n  harbor: 'https://example.org/sub' {\n    interval: 1h\n  }\n}")[0];
  expect(providerChanges({name: entry.tag, value: entry.url, interval, agent: '', cache: null, route: ''}, entry, undefined).interval).toBe(edited);
});

it.each([
  ['the cache switched back to the default', 'cache', {cache: true}, true, false],
  ['the cache switched off the default', 'cache', {cache: false}, true, true],
  ['the cache switched with no default', 'cache', {cache: true}, undefined, true],
  ['the route put back to routing', 'route', {route: 'routing'}, undefined, false],
  ['another route', 'route', {route: 'direct'}, undefined, true],
  ['the name with spaces around it', 'name', {name: ' harbor '}, undefined, false],
  ['a blank User-Agent', 'agent', {agent: '  '}, undefined, false]
] as const)('counts only a real change as unsaved: %s', (_, field, change, defaultCache, edited) => {
  const entry = readSubscriptionEntries("subscription {\n  harbor: 'https://example.org/sub'\n}")[0];
  const form = {name: entry.tag, value: entry.url, interval: '', agent: '', cache: null, route: '', ...change};
  expect(providerChanges(form, entry, defaultCache)[field]).toBe(edited);
});
