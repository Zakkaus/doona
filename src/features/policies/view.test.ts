import {expect, it} from 'vitest';
import {nodeFixtures} from '../../api/mock/fixtures';
import {patchGroupConfig} from '../../api/mock/control';
import {translate, type Translator} from '../../i18n';
import {ApiError, LocalError} from '../../api/error';
import type {ConfigSource} from '../../api/model';
import {
  actionErrorText,
  checkDraft,
  checkFields,
  checkUnset,
  checkInvalid,
  checkPatch,
  checkRebase,
  editBlocked,
  groupOwners,
  groupConfigFields,
  groupActionsReason,
  memberViews,
  nodeGridView,
  policyCardView,
  probeSummary,
  untestedHelp
} from './view';
import {memberHealth} from './health';
const t: Translator = (key, params) => translate('en', key, params);
it('projects nested, failed and unmeasured members without inventing latency', () => {
  const {groups} = nodeFixtures(0, true);
  const members = memberViews(memberHealth(groups[0], new Map()), t);
  expect(members.find(member => member.id === 'jp-01')).toMatchObject({unavailable: true, tcp: undefined, status: {text: t('ui.unavailable'), tone: 'err'}});
  expect(members.find(member => member.id === 'resilient')).toMatchObject({
    healthy: false,
    description: ' ',
    status: {text: t('ui.group'), badge: true}
  });
  expect(members.find(member => member.id === 'hk-01')?.status).toEqual({text: '84 ms', tone: 'ok'});
});
it('keeps split network selection unset for both and omits mutable interrupt configuration from readonly fields', () => {
  const g = nodeFixtures(0).groups[0];
  const members = memberViews(memberHealth(g, new Map()), t);
  expect(policyCardView(g, members, 'both', t).selected).toBeUndefined();
  // Both networks, two members: each is marked with the network it carries.
  expect(policyCardView(g, members, 'both', t).marks).toEqual({'hk-01': 'TCP', 'hk-02': 'UDP'});
  expect(policyCardView(g, members, 'tcp', t).marks).toEqual({});
  expect(policyCardView(g, members, 'tcp', t).selected).toBe('hk-01');
  expect(policyCardView(g, members, 'udp', t).selected).toBe('hk-02');
  expect(policyCardView(g, members, 'both', t).fields.some(([key]) => key === t('policy.cfg.interruptConnections'))).toBe(false);
  expect(groupConfigFields(g)).toContainEqual(['policy.cfg.checkInterval', {key: 'policy.cfg.seconds', params: {n: 30}}]);
  expect(groupConfigFields(g)).toContainEqual(['policy.cfg.interruptConnections', {key: 'ui.no'}]);
  // An unset option reads as off, flagged so the card can say the engine default applies.
  const unset = {...g, config: {...g.config, interrupt_connections: null}};
  expect(policyCardView(unset, members, 'both', t)).toMatchObject({interrupt: false, interruptUnset: true});
  expect(policyCardView(g, members, 'both', t).interruptUnset).toBe(false);
  expect(patchGroupConfig(g, [{op: 'replace', path: '/config/interrupt_connections', value: null}]).config.interrupt_connections).toBeNull();
});
it('counts worst probe outcome once per member and reports selection changes', () => {
  const sample = {
    ...nodeFixtures(0).groups[0].runtime.health[0],
    resolved_leaf_node_id: null,
    purpose: 'data' as const,
    warmth: 'warm' as const,
    kind: 'tcp_connect' as const,
    health_updated: true
  };
  const result = probeSummary({
    target: {type: 'group', group_id: 'proxy'},
    selection_before: {tcp: null, udp: null},
    selection_after: {tcp: 'a', udp: null},
    results: [
      {...sample, member_id: 'a', state: 'healthy'},
      {...sample, member_id: 'a', state: 'unavailable'},
      {...sample, member_id: 'b', state: 'unknown'}
    ],
    selection_changed: {tcp: true, udp: false}
  });
  expect(result).toEqual({key: 'policy.probeChanged', params: {healthy: 0, unavailable: 1, unknown: 1}});
});

it('names the policy as the picker does and keeps the engine spelling for the tooltip', () => {
  const group = nodeFixtures(0).groups[0];
  const card = (native: string) => policyCardView({...group, policy: {kind: 'urltest', native}}, [], 'both', t).policy;
  expect(card('min_moving_avg')).toEqual({label: t('policy.kind.urltest'), id: 'min_moving_avg'});
  expect(card('min_avg10')).toEqual({label: t('policy.kind.urltest'), id: 'min_avg10'});
  expect(card('')).toEqual({label: t('policy.kind.urltest'), id: 'urltest'});
});

it('filters large grids by region and observed health without mutating member order', () => {
  const nodes = Array.from({length: 13}, (_, index) => ({
    id: String(index),
    name: `node-${index}`,
    tcp: 20 - index,
    unavailable: index === 0,
    healthy: index > 0,
    status: {text: ''},
    description: '',
    region: index < 3 ? 'HK' : '?'
  }));
  const contains = (value: string, query: string) => value.includes(query);
  const view = nodeGridView(nodes, {q: 'node', region: 'HK', sort: 'latency', aliveOnly: true}, contains, t, 'en-US');
  expect(view.shown.map(node => node.id)).toEqual(['2', '1']);
  expect(nodes[0].id).toBe('0');
  expect(view.regions).toContainEqual({id: 'HK', label: 'HK', desc: '3'});
  expect(view.count).toBe(t('policy.members', {n: 2}));
  const small = nodeGridView(nodes.slice(0, 2), {q: 'missing', region: '?', sort: 'latency', aliveOnly: true}, contains, t, 'en-US');
  expect(small.shown.map(node => node.id)).toEqual(['0', '1']);
});

it('names the default member and describes an observation in words', () => {
  const g = nodeFixtures(0).groups[0];
  const member = g.members[0];
  const fields = groupConfigFields({...g, config: {...g.config, default_member_id: member.id}});
  expect(fields).toContainEqual(['policy.cfg.defaultMember', member.name]);
  const [view] = memberViews([{...member, kind: 'node', health: {...g.runtime.health[0], transport: 'udp', purpose: 'dns'}}], t);
  expect(view.description).toBe(t('policy.observedVia', {transport: 'UDP', purpose: 'DNS'}));
  // The usual observation, over TCP on the data path, goes without saying on every tile.
  const [usual] = memberViews([{...member, kind: 'node', health: {...g.runtime.health[0], transport: 'tcp', purpose: 'data'}}], t);
  expect(usual.description).toBe(' ');
});

it('reports a partial probe with translated counts and the stopping error', () => {
  const cause = new LocalError('ui.operationFailed', 'member refused');
  const error = Object.assign(new LocalError('ui.operationFailed'), {cause, partialResult: {}, completed: 1200, total: 1500});
  const text = actionErrorText(error, t);
  expect(text).toContain(t('policy.probePartial', {done: 1200, n: 1500, error: t('ui.valuePair', {label: t('ui.operationFailed'), value: 'member refused'})}));
  expect(text).toContain('1,200');
  expect(text).not.toContain('ui.operationFailed');
  expect(actionErrorText(new ApiError(503, 'unavailable', 'offline'), t)).toBe(t('ui.backendMessage', {message: 'offline'}));
});

// Pinning depends on each group's can_override, which the page-wide note cannot know; the cards offer it themselves.
it('keeps pinning out of the page-wide note in every language', () => {
  expect(translate('en', 'policy.note')).not.toMatch(/pin/i);
  // The zh word for pinning, taken from the pinned badge.
  for (const lang of ['zh-TW', 'zh-CN'] as const) expect(translate(lang, 'policy.note')).not.toContain(translate(lang, 'policy.overridden').slice(-2));
});

it('counts each probed member once, by the row that says most', () => {
  const row = (member_id: string, ip_version: 'ipv4' | 'ipv6', state: 'healthy' | 'unavailable' | 'unknown') => ({
    member_id,
    ip_version,
    state,
    kind: 'tcp_connect',
    transport: 'tcp',
    purpose: 'data',
    warmth: 'cold',
    latency_ms: state === 'healthy' ? 0.2 : null,
    error: state === 'healthy' ? null : {code: state === 'unknown' ? 'address_unavailable' : 'probe_failed', message: ''},
    health_updated: true,
    observed_at: '2026-09-20T04:12:36.546Z',
    resolved_leaf_node_id: member_id
  });
  const summary = probeSummary({
    target: {type: 'group', group_id: 'g'},
    selection_changed: {tcp: false, udp: false},
    selection_before: {tcp: null, udp: null},
    selection_after: {tcp: null, udp: null},
    // Every member also gets an ipv6 row with no address; it must not hide the ipv4 answer.
    results: [
      row('a', 'ipv4', 'healthy'),
      row('a', 'ipv6', 'unknown'),
      row('b', 'ipv6', 'unknown'),
      row('b', 'ipv4', 'unavailable'),
      row('c', 'ipv4', 'unknown')
    ]
  } as unknown as Parameters<typeof probeSummary>[0]);
  expect(summary).toEqual({key: 'policy.probeUnchanged', params: {healthy: 1, unavailable: 1, unknown: 1}});
});
const withInterval = <G extends ReturnType<typeof nodeFixtures>['groups'][number]>(g: G): G => ({
  ...g,
  capabilities: {...g.capabilities, mutable_config: [...g.capabilities.mutable_config, 'check_interval']}
});
it('offers the check fields a group lists as writable, whatever its policy', () => {
  const [proxy, resilient] = nodeFixtures(0).groups;
  // The mock lists no check_url or idle_timeout for a selector group; a backend that probes one lists them and gets them.
  expect(checkFields(proxy)).toEqual(['tolerance']);
  expect(checkFields(withInterval(proxy))).toEqual(['check_interval', 'tolerance']);
  // honk lists no check_interval; a backend that also lists it gets every field, in the dialog's order.
  expect(checkFields(resilient)).toEqual(['check_url', 'tolerance', 'idle_timeout']);
  expect(checkFields(withInterval(resilient))).toEqual(['check_url', 'check_interval', 'tolerance', 'idle_timeout']);
});
it('captions an unset tolerance as the engine default while its field stays empty', () => {
  const g = nodeFixtures(0).groups[1];
  const unset = {...g, config: {...g.config, tolerance: null}};
  expect(checkUnset(unset, 'tolerance', '')).toBe(true);
  expect(checkUnset(unset, 'tolerance', '50')).toBe(false);
  expect(checkUnset(unset, 'idle_timeout', '')).toBe(false);
  expect(checkUnset({...g, config: {...g.config, tolerance: 50}}, 'tolerance', '')).toBe(false);
});
it('patches only the check fields that changed, testing each against its opening value and sending null for an empty one', () => {
  const g = withInterval(nodeFixtures(0).groups[1]);
  const base = checkDraft(g);
  expect(checkPatch(g, base, {...base, check_url: '', check_interval: '30'})).toEqual([]);
  // An unset field tests against null: honk and the contract hold it as null, not as an absent path.
  expect(checkPatch(g, base, {...base, check_url: ' https://cp.cloudflare.com/ '})).toEqual([
    {op: 'test', path: '/config/check_url', value: null},
    {op: 'replace', path: '/config/check_url', value: 'https://cp.cloudflare.com/'}
  ]);
  expect(checkPatch(g, base, {...base, check_interval: ''})).toEqual([
    {op: 'test', path: '/config/check_interval', value: 30},
    {op: 'replace', path: '/config/check_interval', value: null}
  ]);
  const set = {...g, config: {...g.config, check_url: 'http://a.example/'}};
  expect(checkPatch(set, checkDraft(set), {...base, check_url: '', check_interval: '60'})).toEqual([
    {op: 'test', path: '/config/check_url', value: 'http://a.example/'},
    {op: 'replace', path: '/config/check_url', value: null},
    {op: 'test', path: '/config/check_interval', value: 30},
    {op: 'replace', path: '/config/check_interval', value: 60}
  ]);
  // A field the backend does not list is never sent.
  const urlOnly = {...g, capabilities: {...g.capabilities, mutable_config: ['check_url' as const]}};
  expect(checkPatch(urlOnly, base, {...base, check_interval: '60', tolerance: '50', idle_timeout: ''})).toEqual([]);
});
it('patches the tolerance and idle timeout like the interval, in their units, and the mock accepts them', () => {
  const g = nodeFixtures(0).groups[1];
  const base = checkDraft(g);
  expect(base).toMatchObject({tolerance: '10', idle_timeout: '1800'});
  const ops = checkPatch(g, base, {...base, tolerance: ' 0 ', idle_timeout: ''});
  expect(ops).toEqual([
    {op: 'test', path: '/config/tolerance', value: 10},
    {op: 'replace', path: '/config/tolerance', value: 0},
    {op: 'test', path: '/config/idle_timeout', value: 1800},
    {op: 'replace', path: '/config/idle_timeout', value: null}
  ]);
  expect(patchGroupConfig(g, ops).config).toMatchObject({tolerance: 0, idle_timeout: null});
  // The selector group lists the tolerance but not the idle timeout, so only the tolerance is sent.
  const proxy = nodeFixtures(0).groups[0];
  const selector = checkDraft(proxy);
  expect(checkPatch(proxy, selector, {...selector, tolerance: '50', idle_timeout: '60'})).toEqual([
    {op: 'test', path: '/config/tolerance', value: 10},
    {op: 'replace', path: '/config/tolerance', value: 50}
  ]);
});
it('sends only the check fields the user changed, not ones the group changed since the dialog opened', () => {
  const g = withInterval(nodeFixtures(0).groups[1]);
  const base = checkDraft(g);
  // Another client set the interval to 60 while the dialog was open; the user edited the URL only.
  const moved = {...g, config: {...g.config, check_interval: 60}};
  expect(checkPatch(moved, base, {...base, check_url: 'http://a.example/'})).toEqual([
    {op: 'test', path: '/config/check_url', value: null},
    {op: 'replace', path: '/config/check_url', value: 'http://a.example/'}
  ]);
  expect(checkPatch(moved, base, base)).toEqual([]);
});
it('refuses a check change another client made to the same field since the dialog opened, and keeps an unrelated one', () => {
  const g = withInterval(nodeFixtures(0).groups[1]);
  const base = checkDraft(g);
  const draft = {...base, check_url: 'http://mine.example/'};
  const sameField = {...g, config: {...g.config, check_url: 'http://theirs.example/'}};
  expect(() => patchGroupConfig(sameField, checkPatch(sameField, base, draft))).toThrow(expect.objectContaining({status: 409, code: 'state_conflict'}));
  const otherField = {...g, config: {...g.config, check_interval: 60}};
  expect(patchGroupConfig(otherField, checkPatch(otherField, base, draft)).config).toMatchObject({
    check_url: 'http://mine.example/',
    check_interval: 60
  });
});
it('rebases a refused check draft on the group read again, keeping every edit and noting the values the group took', () => {
  const base = {check_url: '', check_interval: '30', tolerance: '10', idle_timeout: '1800'};
  const current = {check_url: 'http://theirs.example/', check_interval: '30', tolerance: '10', idle_timeout: '600'};
  const value = {check_url: 'http://mine.example/', check_interval: '60', tolerance: '50', idle_timeout: '900'};
  // tolerance: the user and the group made the same change; check_interval: only the user changed it.
  expect(checkRebase({base, value, theirs: {}}, {...current, tolerance: '50'})).toEqual({
    base: {...current, tolerance: '50'},
    value,
    theirs: {check_url: 'http://theirs.example/', idle_timeout: '600'}
  });
  // A field only the group changed follows it.
  expect(checkRebase({base, value: {...value, idle_timeout: '1800'}, theirs: {}}, current).value.idle_timeout).toBe('600');
});
it('accepts only a safe http URL, a positive whole interval and a whole tolerance and idle timeout, or an empty field', () => {
  for (const url of ['', 'http://a.example', 'https://a.example:8443/generate_204?x=1']) expect(checkInvalid('check_url', url)).toBe(false);
  for (const url of [
    'ftp://a.example/',
    'a.example/',
    'http://user@a.example/',
    'http://a.example/a b',
    'http://a.example/a,b',
    'https://',
    'https://a.example/' + 'x'.repeat(2048)
  ])
    expect(checkInvalid('check_url', url)).toBe(true);
  for (const interval of ['', '1', ' 30 ']) expect(checkInvalid('check_interval', interval)).toBe(false);
  for (const interval of ['0', '-1', '1.5', '1e3', 'x']) expect(checkInvalid('check_interval', interval)).toBe(true);
  for (const field of ['tolerance', 'idle_timeout'] as const) {
    for (const value of ['', '0', ' 50 ']) expect(checkInvalid(field, value)).toBe(false);
    for (const value of ['-1', '1.5', '1e3', 'x', '9007199254740993']) expect(checkInvalid(field, value)).toBe(true);
  }
});

it('offers Test all for untested members only where the group takes a probe', () => {
  expect(untestedHelp('2 untested', true, t)).toEqual({title: '2 untested', text: [t('policy.untestedHelp'), t('policy.untestedProbe')]});
  expect(untestedHelp('2 untested', false, t)?.text).toEqual([t('policy.untestedHelp'), t('policy.untestedNoProbe')]);
  expect(untestedHelp(null, true, t)).toBeNull();
});

it("says why a group's Edit or Test all is disabled, Edit first, and nothing while a change is in flight", () => {
  const edit = {shown: true, busy: false, blocked: null};
  const probe = {busy: false, canProbe: true};
  expect(groupActionsReason(edit, probe, t)).toBeNull();
  expect(groupActionsReason({...edit, blocked: t('policy.editNoEntry')}, {...probe, canProbe: false}, t)).toBe(t('policy.editNoEntry'));
  expect(groupActionsReason(edit, {...probe, canProbe: false}, t)).toBe('Test all is not available for this group');
  // A hidden or busy Edit gives no reason of its own.
  expect(groupActionsReason({...edit, shown: false, blocked: t('policy.editNoEntry')}, probe, t)).toBeNull();
  expect(groupActionsReason({...edit, busy: true, blocked: t('policy.editNoEntry')}, {...probe, canProbe: false}, t)).toBe(t('policy.noProbe'));
  expect(groupActionsReason(edit, {busy: true, canProbe: false}, t)).toBeNull();
});

it('finds the one source that declares each group, and none when two entries do', () => {
  const source = (id: string, content: string, writable = true) =>
    ({id, path: id + '.dae', kind: 'include', content, content_sha256: '', writable, loaded_at: ''}) as ConfigSource;
  const main = source('main', 'group {\n  proxy { policy: fixed(0) }\n  twice { policy: fixed(0) }\n}\n');
  const extra = source('extra', 'group {\n  media { filter: name(hk-01) policy: min }\n  twice { policy: min }\n}\n');
  const owners = groupOwners([main, extra]);
  expect(owners.get('proxy')).toMatchObject({origin: {id: 'main'}, entry: {name: 'proxy', policy: 'fixed(0)'}});
  expect(owners.get('media')).toMatchObject({origin: {id: 'extra'}, entry: {filters: ['name(hk-01)']}});
  expect(owners.get('twice')).toBe('ambiguous');
  expect(owners.has('other')).toBe(false);
});

it('says why a group cannot be edited in the source that declares it', () => {
  const origin = {id: 'extra', path: '/etc/honk/extra.dae', writable: true} as ConfigSource;
  const owner = {entry: {name: 'media', written: 'media', filters: [], policy: null, from: 1, to: 1}, origin};
  const state = {loaded: true, complete: true, error: null};
  expect(editBlocked(owner, state, t)).toBeNull();
  expect(editBlocked(owner, {...state, error: new LocalError('ui.groupNotLoaded')}, t)).toBe(t('ui.groupNotLoaded'));
  expect(editBlocked(undefined, {...state, loaded: false}, t)).toBe(t('policy.editNoConfig'));
  expect(editBlocked(undefined, state, t)).toBe(t('policy.editNoEntry'));
  expect(editBlocked('ambiguous', state, t)).toBe(t('policy.editAmbiguous'));
  expect(editBlocked({...owner, origin: {...origin, writable: false}}, state, t)).toBe('This group is defined in /etc/honk/extra.dae, which is read-only');
  expect(editBlocked(owner, {...state, complete: undefined}, t)).toBe(t('policy.editNoConfig'));
  expect(editBlocked(owner, {...state, complete: false}, t)).toBe(t('config.incomplete'));
});
