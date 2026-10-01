import {expect, it} from 'vitest';
import {createMockApi} from '../../api/mock';
import type {ConfigSource, DnsRoutingRule, ReportedCapabilities, RoutingRule} from '../../api/model';
import {normalizeCapabilities} from '../../api/capabilities';
import {translate, type Translator} from '../../i18n';
import {
  addRuleReason,
  chainLinks,
  nameLinks,
  addRuleTip,
  traceReason,
  dictionaryView,
  distributionView,
  dnsDictionaryView,
  dnsView,
  queryView,
  evaluationView,
  removalView,
  ruleDraftView,
  rulesView,
  traceSeed,
  traceStatusView,
  distributionEmpty
} from './view';

const t: Translator = (key, params, pluralParam, precision) => translate('en', key, params, pluralParam, precision);

it('labels the dictionary caption with the generation id it received, untranslated in every locale', async () => {
  const api = createMockApi();
  const [rules, config] = await Promise.all([api.rules(), api.config()]);
  const caption = dictionaryView(rules.rules, 'gen-77', undefined, config.sources, [], t, 'en').caption;
  expect(caption).toContain('generation gen-77');
  expect(caption).not.toContain(config.revision);
  expect(translate('zh-TW', 'rule.dictionaryCaption', {n: 2, generation: 'gen-77'})).toMatch(/generation gen-77$/);
  expect(translate('zh-CN', 'ui.generation')).toBe('generation');
  expect(translate('zh-TW', 'ui.generation')).toBe('generation');
});

it('lists the first place and the end first in the position picker, and finds the others by their rule', async () => {
  const api = createMockApi();
  const [rules, config, groups] = await Promise.all([api.rules(), api.config(), api.groups()]);
  const view = dictionaryView(rules.rules, rules.generation_id, undefined, config.sources, groups, t, 'en');
  const [ends, others] = view.positionSections;
  const [first, second] = rules.rules;
  expect(ends.title).toBeUndefined();
  expect(ends.items.map(item => [item.id, item.label])).toEqual([
    [first.rule_id, t('conn.ruleTop')],
    ['end', t('rule.positionEnd')]
  ]);
  expect(others.title).toBe(t('rule.positionOthers'));
  expect(others.items[0]).toEqual({
    id: second.rule_id,
    label: t('rule.positionBefore', {n: 2}),
    desc: second.expression,
    keywords: second.expression
  });
  // The picker offers the same places as the list of positions, each once.
  const ids = view.positionSections.flatMap(section => section.items.map(item => item.id));
  expect(ids.sort()).toEqual(view.positions.map(position => position.id).sort());
  const locked = dictionaryView(
    rules.rules,
    rules.generation_id,
    undefined,
    config.sources.map(source => ({...source, writable: false})),
    groups,
    t,
    'en'
  );
  expect(locked.positionSections).toEqual([]);
});

it('offers edits only at writable sources and preserves source locations when paths are redacted', async () => {
  const api = createMockApi();
  const [rules, config, flows, groups] = await Promise.all([api.rules(), api.config(), api.flows(), api.groups()]);
  const first = rules.rules[0];
  expect(first.source).toMatchObject({source_id: 'src-main', line: 149, column: 3});
  const view = dictionaryView(rules.rules, rules.generation_id, flows, config.sources, groups, t, 'en');
  expect(view.rows[0].position).toBe('config.dae:149');
  expect(view.rows[0].sourceQuery).toBe('tab=source&source=src-main&line=149');
  expect(view.positions[0].id).toBe('end');
  expect(view.rows.at(-1)?.number).toBe('—');
  expect(view.rows.at(-1)?.removable).toBe(false);
  // The written fallback cannot be removed, but its outbound can be edited.
  expect(view.rows.at(-1)?.editReason).toBeNull();
  const locked = dictionaryView(
    rules.rules,
    rules.generation_id,
    flows,
    config.sources.map(source => ({...source, writable: false})),
    groups,
    t,
    'en'
  );
  expect(locked.positions).toEqual([]);
  expect(locked.rows.some(row => row.removable)).toBe(false);
  expect(locked.rows[0].editReason).toBe(t('config.readOnlyAttempt'));
  const redacted = {...first, source: {file: '<redacted>', source_id: 'src-main', line: 40, column: null}};
  expect(dictionaryView([redacted], undefined, undefined, [], [], t, 'en').rows[0].position).toBe(t('rule.lineOnly', {n: '40'}));
  expect(removalView(redacted, [], t).help).toBe(t('rule.removeHelp', {file: '', line: '40'}));
});

it('does not offer rules it cannot locate in their source for removal or insertion', () => {
  const rule: RoutingRule = {
    rule_id: 'r1',
    index: 0,
    kind: 'rule',
    expression: 'pname(a)',
    outbound: 'direct',
    must: false,
    source: {file: 'bare.dae', source_id: 'bare', line: 1, column: 1}
  };
  const bare = {id: 'bare', path: 'bare.dae', writable: true, content: 'pname(a) -> direct\n'} as ConfigSource;
  const view = dictionaryView([rule], '1', undefined, [bare], [], t, 'en');
  expect(view.rows[0].removable).toBe(false);
  expect(view.rows[0].editReason).toBe(t('rule.notLocated'));
  expect(view.positions).toEqual([]);
});

it('sorts distribution rows numerically and retains snapshot denominators when filtering', async () => {
  const list = await createMockApi().flows();
  const flow = list.flows[0];
  list.flows = [
    {...flow, id: 'a', rule_id: 'r10', rule_expression: 'ten', rule_source: 'kernel'},
    {...flow, id: 'b', rule_id: 'r2', rule_expression: 'two', rule_source: 'recomputed'},
    {...flow, id: 'c', rule_id: null, rule_expression: null, rule_source: 'unknown'}
  ];
  list.dropped_records = null;
  const all = distributionView(list, 'all', t, 'en');
  expect(all.rows.map(row => row.ruleId)).toEqual(['r2', 'r10', '—']);
  expect(all.rows[2].expression).toBe(t('rule.unknownRule'));
  expect(all.droppedUnknown).toBe(true);
  expect(distributionView(list, 'kernel', t, 'en').rows.map(row => [row.expression, row.share])).toEqual([['ten', '33.3%']]);
  expect(distributionView(undefined, 'all', t, 'en').rows).toEqual([]);
});

it('validates picked and raw conditions separately and prepares their preview', () => {
  expect(ruleDraftView('dip', '2001:db8::1', true, 'dip(2001:db8::1)', '', t)).toMatchObject({preview: 'dip(2001:db8::1)', valid: true, mode: 'pick'});
  expect(ruleDraftView('dip', ' ', true, '', '', t).valid).toBe(false);
  expect(ruleDraftView('dip', '', false, '', 'dip(a) -> direct', t)).toMatchObject({valid: false, rawInvalid: true, preview: null});
  expect(ruleDraftView('dip', '', false, '', 'dip(a)', t).valid).toBe(true);
  // A comment, a second line, a brace or unbalanced parentheses is refused like a missing call; joined calls pass.
  for (const raw of ['domain(a) # x', 'domain(a)\ndport(1)', 'domain(a) {', 'domain(a', 'domain(a))', 'direct'])
    expect(addRuleReason(ruleDraftView('dip', '', false, '', raw, t), 'proxy', t)).toBe(t('rule.conditionInvalid'));
  expect(ruleDraftView('dip', '', false, '', "domain(a) && dport(80) && pname('a#b')", t).valid).toBe(true);
});

it('marks a picked value that cannot be written as a condition invalid with a field error', () => {
  expect(ruleDraftView('dip', "a'b", true, null, '', t)).toMatchObject({valid: false, preview: null, pickError: t('rule.valuesInvalid')});
});

it('rejects unavailable tab requests and keeps trace-only navigation usable', async () => {
  const {resources} = await createMockApi().capabilities();
  resources.flows.available = false;
  resources.rules.available = false;
  resources.dns_rules.available = false;
  resources.routing_trace.available = true;
  const view = rulesView(resources, 'tab=map', t);
  expect(view.tabs.map(tab => tab.id)).toEqual(['trace']);
  expect(view.tab).toBe('trace');
  expect(view.fallback).toBe('trace');
  // Before the capabilities arrive the default is not fixed, so a chosen tab is always written.
  expect(rulesView(undefined, '', t).fallback).toBeNull();
});

it('prepares uncertain evaluations, rule fallbacks and probe eligibility', async () => {
  const api = createMockApi();
  const result = await api.routingTrace({input: {network: 'tcp', domain: 'example.com', dst_port: 443}, resolve: 'none'});
  const {nodes} = await api.nodes({limit: 1000});
  const node = {...nodes[0], health: []};
  const evaluation = {
    ...result.evaluations[0],
    dst_ip: null,
    decision: 'indeterminate' as const,
    outbound: null,
    missing_inputs: ['dst_ip'],
    rules: [{rule_id: 'missing', expression: null, result: 'indeterminate' as const, missing_inputs: ['dst_ip'], conditions: []}]
  };
  const view = evaluationView(evaluation, 0, 'example.com', 'proxy', {groups: [], node}, true, node.id, t, 'en');
  expect(view.heading).toBe('example.com');
  expect(view.fields).toContainEqual([t('rule.likelyOutbound'), 'proxy']);
  expect(view.fields).toContainEqual([t('rule.reach'), t('rule.untested')]);
  expect(view.hint).toBe(t('rule.likelyHelp', {inputs: 'dst_ip'}));
  expect(view.rows[0]).toMatchObject({expression: 'missing', tone: 'warn', missing: 'dst_ip'});
  expect(view.probe).toMatchObject({pending: true, disabled: true});
  expect(evaluationView(evaluation, 0, undefined, null, {groups: [], node: {...node, protocol: 'direct'}}, true, null, t, 'en').probe).toBeNull();
  expect(evaluationView(evaluation, 0, undefined, null, {groups: [], node: null}, true, null, t, 'en').fields).toContainEqual([
    t('rule.reach'),
    t('rule.noMember')
  ]);
  expect(traceStatusView(result, null, t, 'en')).toContain(t('ui.valuePair', {label: t('ui.generation'), value: result.generation_id}));
  expect(traceStatusView(result, null, t, 'en')).not.toContain(t('rule.queried'));
});

it('prepares DNS diagnostics with missing addresses and errors', async () => {
  const result = await createMockApi().routingTrace({input: {network: 'tcp', domain: 'example.com', dst_port: 443}, resolve: 'live'});
  const dns = {...result.dns[0], addresses: [], error: 'lookup failed'};
  const view = dnsView(dns, t, 'en');
  expect(view.heading).toBe('DNS: ' + dns.name);
  expect(view.fields).toContainEqual([t('rule.address'), '—']);
  expect(view.fields).toContainEqual([t('ui.error'), 'lookup failed']);
});

it('shows a DNS query apart from the simulations, one row per record type with the address it simulated', async () => {
  const query = await createMockApi().dnsQuery('example.com', ['A', 'AAAA', 'TXT']);
  const view = queryView({...query, domain: 'example.com.'}, t, 'en');
  expect(view.heading).toBe(t('rule.queryHeading', {name: 'example.com'}));
  const row = (type: string) => view.fields.find(([label]) => label === type)![1];
  const first = (type: string) => query.results.find(result => result.type === type)!.answers![0].data;
  expect(row('A')).toContain(t('ui.valuePair', {label: t('rule.simulatedAddress'), value: first('A')}));
  expect(row('AAAA')).toContain(t('ui.valuePair', {label: t('rule.simulatedAddress'), value: first('AAAA')}));
  expect(row('TXT')).not.toContain(t('rule.simulatedAddress'));
  expect(view.fields.map(([label]) => label)).toEqual(['A', 'AAAA', 'TXT', t('ui.upstream')]);
  const result = await createMockApi().routingTrace({input: {network: 'tcp', domain: 'example.com', dst_port: 443}, resolve: 'none'});
  expect(traceStatusView(result, query, t, 'en')).toContain(t('rule.queried'));
});

it('sums current-expression hits across provenance without attributing historical rules', async () => {
  const api = createMockApi();
  const [rules, flows] = await Promise.all([api.rules(), api.flows()]);
  const rule = rules.rules[0];
  const flow = flows.flows[0];
  const current = {...flow, rule_id: rule.rule_id, rule_generation_id: rules.generation_id};
  flows.flows = [
    {...current, id: 'kernel', rule_expression: rule.expression, rule_source: 'kernel'},
    {...current, id: 'recomputed', rule_expression: rule.expression, rule_source: 'recomputed'},
    {...current, id: 'historical', rule_expression: 'domain(old.example)', rule_source: 'kernel'},
    {...current, id: 'other-generation', rule_generation_id: 'older', rule_expression: rule.expression, rule_source: 'kernel'}
  ];
  expect(dictionaryView([rule], rules.generation_id, flows, [], [], t, 'en').rows[0].hits).toBe('2');
  expect(dictionaryView([rule], undefined, flows, [], [], t, 'en').rows[0].hits).toBe('—');
});

it('does not infer a source from its display name when the ID is unknown', async () => {
  const api = createMockApi();
  const [rules, config] = await Promise.all([api.rules(), api.config()]);
  const source = config.sources[0];
  const rule = rules.rules[0];
  const sources = [
    {...source, id: 'a', path: '/a/config.dae'},
    {...source, id: 'b', path: '/b/config.dae'}
  ];
  const unknown = {...rule, source: {...rule.source!, file: 'config.dae', source_id: 'missing'}};
  const explicit = {...rule, rule_id: 'explicit', source: {...rule.source!, file: 'config.dae', source_id: 'b'}};
  const view = dictionaryView([unknown, explicit], undefined, undefined, sources, [], t, 'en');
  expect(view.rows[0]).toMatchObject({sourceQuery: null, removable: false});
  expect(view.rows[1]).toMatchObject({sourceQuery: 'tab=source&source=b&line=149', removable: true});
});

it('tips why a rule cannot be added: no writable place first, then a change still being applied', () => {
  expect(addRuleTip(true, true, t)).toBe(t('conn.ruleNoPosition'));
  expect(addRuleTip(false, true, t)).toBe('Another change is being applied');
  expect(addRuleTip(false, false, t)).toBeUndefined();
});

it('tells an empty distribution apart by the recorder, then by the source filter, and explains the sources', () => {
  const recorder = (mode: 'auto' | 'on' | 'off', allowed = true) => ({allowed, mode, active: mode === 'on'});
  expect(distributionEmpty(recorder('off'), 'kernel', t)).toBe(t('rule.distributionNotRecorded'));
  expect(distributionEmpty(recorder('off', false), 'all', t)).toBe(t('rule.distributionForbidden'));
  expect(distributionEmpty(recorder('off', false), 'kernel', t)).toBe(t('rule.distributionForbidden'));
  expect(distributionEmpty(recorder('on'), 'kernel', t)).toBe(t('rule.distributionFiltered'));
  expect(distributionEmpty(undefined, 'all', t)).toBe(t('rule.distributionEmpty'));
  const view = distributionView(undefined, 'all', t, 'en', recorder('off'));
  expect(view.empty).toBe(t('rule.distributionNotRecorded'));
  expect(view.choices.map(([id]) => id)).toEqual(['all', 'kernel', 'userspace', 'recomputed', 'unknown']);
  expect(t('rule.sourceRecomputed')).toBe('Recomputed');
  expect(view.sourceHelp.text).toEqual([
    t('ui.valuePair', {label: t('rule.sourceKernel'), value: t('rule.sourceHelp.kernel')}),
    t('ui.valuePair', {label: t('rule.sourceUserspace'), value: t('rule.sourceHelp.userspace')}),
    t('ui.valuePair', {label: t('rule.sourceRecomputed'), value: t('rule.sourceHelp.recomputed')}),
    t('ui.valuePair', {label: t('rule.sourceUnknown'), value: t('rule.sourceHelp.unknown')})
  ]);
});

it('says why Add is disabled in the add-rule dialog: the condition first, then the outbound', () => {
  const ok = {valid: true, mode: 'pick', pickError: undefined, rawInvalid: false};
  expect(addRuleReason(ok, 'proxy', t)).toBeNull();
  expect(addRuleReason(ok, '', t)).toBe('Choose an outbound');
  expect(addRuleReason({...ok, valid: false}, '', t)).toBe('Enter the values');
  expect(addRuleReason({...ok, valid: false, pickError: t('rule.valuesInvalid')}, 'proxy', t)).toBe(t('rule.valuesInvalid'));
  expect(addRuleReason({...ok, valid: false, mode: 'text'}, 'proxy', t)).toBe('Enter a condition');
  expect(addRuleReason({...ok, valid: false, mode: 'text', rawInvalid: true}, 'proxy', t)).toBe(t('rule.conditionInvalid'));
});

it('says why Run trace is disabled, and nothing while the capabilities load or a trace runs', () => {
  const ok = {loaded: true, busy: false, available: true, invalid: null, modeOffered: true};
  expect(traceReason(ok, t)).toBeNull();
  expect(traceReason({...ok, loaded: false, available: false}, t)).toBeNull();
  expect(traceReason({...ok, busy: true, invalid: 'rule.invalidTarget'}, t)).toBeNull();
  expect(traceReason({...ok, available: false, invalid: 'rule.invalidTarget'}, t)).toBe('The backend cannot run a trace right now');
  expect(traceReason({...ok, invalid: 'rule.invalidTarget', modeOffered: false}, t)).toBe('Enter a domain or destination IP.');
  expect(traceReason({...ok, modeOffered: false}, t)).toBe('The backend does not offer this resolution mode');
});

it('puts the rule lists first, routing then DNS, and offers DNS only when the backend lists its rules', async () => {
  const {resources} = await createMockApi().capabilities();
  const view = rulesView(resources, '', t);
  expect(view.tabs.map(tab => tab.id)).toEqual(['list', 'dns', 'trace']);
  expect(view.tabs.map(tab => tab.label)).toEqual(['Routing rules', 'DNS rules', 'Trace simulation']);
  expect(view).toMatchObject({tab: 'list', fallback: 'list'});
  expect(rulesView(resources, 'tab=dns', t).tab).toBe('dns');
  expect(rulesView(resources, 'tab=trace', t).tab).toBe('trace');
  resources.dns_rules.available = false;
  expect(rulesView(resources, 'tab=dns', t).tabs.map(tab => tab.id)).toEqual(['list', 'trace']);
  expect(rulesView(resources, 'tab=dns', t).tab).toBe('list');
});

it('opens the rules page without a DNS tab on a backend that does not report DNS rules', async () => {
  const raw = await createMockApi().capabilities();
  const {dns_rules: _dnsRules, ...older} = raw.resources;
  const {resources} = normalizeCapabilities({...raw, resources: older as ReportedCapabilities['resources']});
  expect(rulesView(resources, '', t).tabs.map(tab => tab.id)).toEqual(['list', 'trace']);
});

it('lists DNS request and response rules with their actions, locations and insertion points', async () => {
  const api = createMockApi();
  const [dns, config] = await Promise.all([api.dnsRules(), api.config()]);
  expect(dns.request.at(-1)).toMatchObject({kind: 'fallback', action: 'upstream', upstream: 'cloudflare'});
  expect(dns.response.at(-1)).toMatchObject({kind: 'fallback', action: 'accept', upstream: null});
  const request = dnsDictionaryView('request', dns.request, dns.generation_id, config.sources, t, 'en');
  expect(request.rows.map(row => row.outbound)).toEqual(['reject', 'asis', 'reject', 'alidns', 'cloudflare']);
  expect(request.rows.map(row => row.expression)).toEqual([
    'qname(geosite: category-ads-all)',
    'qname(suffix: lan, home.arpa)',
    'qtype(HTTPS) && qname(geosite: cn)',
    'qname(geosite: cn)',
    'fallback: cloudflare'
  ]);
  expect(request.rows[0]).toMatchObject({number: '1', position: 'config.dae:29', removable: true, hits: '—', must: false});
  expect(request.rows.at(-1)).toMatchObject({number: '—', removable: false});
  expect(request.positions.map(position => position.id)).toEqual(['end', ...dns.request.slice(0, -1).map(rule => rule.rule_id)]);
  // A request rule sends the query to an upstream or answers it itself; a response rule never sends it as is.
  expect(request.outbounds.map(choice => choice.id)).toEqual(['cloudflare', 'alidns', 'asis', 'reject']);
  const response = dnsDictionaryView('response', dns.response, dns.generation_id, config.sources, t, 'en');
  expect(response.rows.map(row => row.outbound)).toEqual(['accept', 'cloudflare', 'accept']);
  expect(response.outbounds.map(choice => choice.id)).toEqual(['accept', 'reject', 'cloudflare', 'alidns']);
  expect(response.outbounds.find(choice => choice.id === 'alidns')?.desc).toBe(t('rule.dns.action.requery'));
});

it('explains an invalid DNS condition and a missing action in DNS terms', () => {
  const keys = {conditionInvalid: 'rule.dns.conditionInvalid', targetMissing: 'rule.dns.actionMissing'} as const;
  expect(addRuleReason(ruleDraftView('qnameSuffix', '', false, '', 'qname', t, ['qnameSuffix']), 'alidns', t, keys)).toBe(t('rule.dns.conditionInvalid'));
  expect(addRuleReason(ruleDraftView('qtype', 'A', true, 'qtype(A)', '', t, ['qtype']), '', t, keys)).toBe(t('rule.dns.actionMissing'));
  expect(ruleDraftView('qtype', '', true, null, '', t, ['qnameSuffix', 'qtype']).choices.map(choice => choice.id)).toEqual(['qnameSuffix', 'qtype']);
});

it('appends DNS rules inside the list block when the fallback is not written, and writes upstream keys as declared', async () => {
  const [base] = (await createMockApi().config()).sources;
  const content =
    "dns {\n  upstream {\n    'my dns': 'udp://1.1.1.1:53'\n    \"other dns\": 'udp://8.8.8.8:53'\n    alidns: 'udp://223.5.5.5:53'\n  }\n  routing {\n    request {\n    }\n    response {\n      qtype(A) -> 'my dns'\n    }\n  }\n}\n";
  const sources = [{...base, content, writable: true}];
  const fallback = (action: DnsRoutingRule['action']): DnsRoutingRule => ({
    rule_id: 'fb',
    index: 0,
    kind: 'fallback',
    expression: `fallback: ${action}`,
    action,
    upstream: null,
    source: null
  });
  const request = dnsDictionaryView('request', [fallback('asis')], 'g', sources, t, 'en');
  expect(request.positions.map(position => position.id)).toEqual(['end']);
  expect(request.positions[0]).toEqual({id: 'end', label: t('rule.positionLast')});
  // A list with no block offers the end of the dns routing block, where the add writes a new one.
  const absent = [{...base, content: content.replace("    response {\n      qtype(A) -> 'my dns'\n    }\n", ''), writable: true}];
  expect(dnsDictionaryView('response', [fallback('accept')], 'g', absent, t, 'en').positions).toEqual([
    {id: 'end', label: t('rule.dns.positionNew', {name: 'response'}), desc: t('rule.dns.positionNewHelp', {name: 'response'})}
  ]);
  expect(request.outbounds.map(({id, label}) => ({id, label}))).toEqual([
    {id: "'my dns'", label: 'my dns'},
    {id: '"other dns"', label: 'other dns'},
    {id: 'alidns', label: 'alidns'},
    {id: 'asis', label: 'asis'},
    {id: 'reject', label: 'reject'}
  ]);
  const rule: DnsRoutingRule = {
    rule_id: 'r9',
    index: 0,
    kind: 'rule',
    expression: "qtype(A) -> 'my dns'",
    action: 'requery',
    upstream: "'my dns'",
    source: {file: 'config.dae', source_id: base.id, line: 11, column: 7}
  };
  const response = dnsDictionaryView('response', [rule, fallback('accept')], 'g', sources, t, 'en');
  expect(response.rows[0]).toMatchObject({expression: 'qtype(A)', outbound: 'my dns', removable: true});
  expect(response.positions.map(position => position.id)).toEqual(['end', 'r9']);
  // A written fallback that doona cannot locate is not replaced by the block's end.
  const written = {...fallback('accept'), source: {file: 'config.dae', source_id: base.id, line: 2, column: 1}};
  expect(dnsDictionaryView('response', [rule, written], 'g', sources, t, 'en').positions.map(position => position.id)).toEqual(['r9']);
});

it('seeds the add-rule dialog from the evaluated target and only a decided match', async () => {
  const input = {network: 'tcp' as const, domain: 'a.example.', dst_port: 443, src_ip: '10.0.0.2'};
  const result = await createMockApi().routingTrace({input, resolve: 'none'});
  const matched = {rule_id: 'r5', expression: 'domain(geosite:telegram)', result: 'matched' as const, missing_inputs: [], conditions: []};
  const evaluation = {...result.evaluations[0], dst_ip: '1.1.1.1', decision: 'determinate' as const, outbound: 'proxy', rules: [matched]};
  expect(traceSeed(input, evaluation)).toEqual({
    domain: 'a.example.',
    dip: '1.1.1.1',
    sip: '10.0.0.2',
    outbound: 'proxy',
    matched: {id: 'r5', expression: 'domain(geosite:telegram)'}
  });
  // The traced address stands in when the evaluation resolved none; an undecided match is not vouched for.
  const undecided = traceSeed({...input, dst_ip: '2001:db8::5'}, {...evaluation, dst_ip: null, decision: 'indeterminate', outbound: null});
  expect(undecided).toMatchObject({dip: '2001:db8::5', outbound: null, matched: null});
});

it('links a trace result to its groups, its node and its DNS name', async () => {
  const api = createMockApi();
  const {nodes} = await api.nodes({limit: 1000});
  const [group] = await api.groups();
  const node = {...nodes.find(node => node.provider_id)!};
  const selected = {groups: [group], node};
  expect(chainLinks(selected, true, [], t)).toEqual([
    {id: 'group:' + group.id, label: t('rule.viewGroup', {name: group.name}), href: '#/policies?group=' + encodeURIComponent(group.id)},
    {id: 'node:' + node.id, label: t('rule.viewNode', {name: node.name}), href: `#/nodes?${new URLSearchParams({provider: node.provider_id!, q: node.name})}`}
  ]);
  // Without a group list the Policies page cannot focus one.
  expect(chainLinks(selected, false, [], t).map(link => link.id)).toEqual(['node:' + node.id]);
  expect(chainLinks(null, true, [], t)).toEqual([]);
  // Until the provider list arrives, the node's owner is unknown and its link waits.
  expect(chainLinks(selected, true, undefined, t).map(link => link.id)).toEqual(selected.groups.map(group => 'group:' + group.id));
  const {resources} = await api.capabilities();
  expect(nameLinks('example.com.', resources, t).map(link => link.href)).toEqual(['#/dns?tab=query&domain=example.com', '#/dns?tab=cache&domain=example.com']);
  expect(nameLinks('example.com', {...resources, dns_cache: {...resources.dns_cache, available: false}}, t).map(link => link.id)).toEqual(['query']);
});

it('marks an outbound mode row for the Activity editor using its source location', async () => {
  const api = createMockApi();
  const [rules, config] = await Promise.all([api.rules(), api.config()]);
  const first = rules.rules[0];
  const sources = config.sources.map(source => {
    if (source.id !== first.source!.source_id) return source;
    const lines = source.content.split('\n');
    lines[first.source!.line - 1] += ' # doona: outbound mode';
    return {...source, content: lines.join('\n')};
  });
  const rows = dictionaryView(rules.rules, rules.generation_id, undefined, sources, [], t, 'en').rows;
  expect(rows[0].modeManaged).toBe(true);
  expect(rows[1].modeManaged).toBe(false);
});

it('keeps marked include rules editable in Rules', async () => {
  const api = createMockApi();
  await api.pollOperation(await api.createConfigSource('config.d/marked.dae', 'routing {\n  l4proto(tcp, udp) -> direct # doona: outbound mode\n}\n'));
  const [rules, config] = await Promise.all([api.rules(), api.config()]);
  const included = config.sources.find(source => source.path.endsWith('/marked.dae'))!;
  const rule = rules.rules.find(rule => rule.source?.source_id === included.id)!;
  expect(rule).toBeDefined();
  const rows = dictionaryView(rules.rules, rules.generation_id, undefined, config.sources, [], t, 'en').rows;
  const row = rows.find(row => row.id === rule.rule_id)!;
  expect(row.modeManaged).toBe(false);
  expect(row.sourceQuery).toBeTruthy();
  expect(row.removable).toBe(true);
  expect(row.editReason).toBeNull();
});
