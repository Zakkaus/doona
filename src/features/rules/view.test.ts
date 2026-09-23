import {expect, it} from 'vitest';
import {createMockApi} from '../../api/mock';
import {translate, type Translator} from '../../i18n';
import {dictionaryView, distributionView, dnsView, evaluationView, removalView, ruleDraftView, rulesView, traceStatusView} from './view';

const t: Translator = (key, params) => translate('en', key, params);

it('offers edits only at writable sources and preserves source locations when paths are redacted', async () => {
  const api = createMockApi();
  const [rules, config, flows, groups] = await Promise.all([api.rules(), api.config(), api.flows(), api.groups()]);
  const first = rules.rules[0];
  const view = dictionaryView(rules.rules, rules.generation_id, flows, config.sources, groups, t, 'en');
  expect(view.rows[0].position).toBe('config.dae:40');
  expect(view.rows[0].sourceQuery).toBe('tab=source&source=src-main&line=40');
  expect(view.positions[0].id).toBe('end');
  expect(view.rows.at(-1)?.number).toBe('—');
  expect(view.rows.at(-1)?.removable).toBe(false);
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
  const withheld = dictionaryView(
    rules.rules,
    rules.generation_id,
    flows,
    config.sources.map(source => ({...source, content: undefined})),
    groups,
    t,
    'en'
  );
  expect(withheld.positions).toEqual([]);
  expect(withheld.rows.some(row => row.removable)).toBe(false);
  const redacted = {...first, source: {file: '<redacted>', line: 40}};
  expect(dictionaryView([redacted], undefined, undefined, [], [], t, 'en').rows[0].position).toBe(t('rule.lineOnly', {n: '40'}));
  expect(removalView(redacted, [], t).help).toBe(t('rule.removeHelp', {file: '', line: '40'}));
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
});

it('rejects unavailable tab requests and keeps trace-only navigation usable', async () => {
  const {resources} = await createMockApi().capabilities();
  resources.flows.available = false;
  resources.rules.available = false;
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
  expect(traceStatusView(result, t, 'en')).toContain(t('ui.valuePair', {label: t('ui.generation'), value: result.generation_id}));
});

it('prepares DNS diagnostics with missing addresses and errors', async () => {
  const result = await createMockApi().routingTrace({input: {network: 'tcp', domain: 'example.com', dst_port: 443}, resolve: 'live'});
  const dns = {...result.dns[0], addresses: [], error: 'lookup failed'};
  const view = dnsView(dns, t, 'en');
  expect(view.heading).toBe('DNS: ' + dns.name);
  expect(view.fields).toContainEqual([t('rule.address'), '—']);
  expect(view.fields).toContainEqual([t('ui.error'), 'lookup failed']);
});

it('sums current-expression hits across provenance without attributing historical rules', async () => {
  const api = createMockApi();
  const [rules, flows] = await Promise.all([api.rules(), api.flows()]);
  const rule = rules.rules[0];
  const flow = flows.flows[0];
  flows.flows = [
    {...flow, id: 'kernel', rule_id: rule.rule_id, rule_expression: rule.expression, rule_source: 'kernel'},
    {...flow, id: 'recomputed', rule_id: rule.rule_id, rule_expression: rule.expression, rule_source: 'recomputed'},
    {...flow, id: 'historical', rule_id: rule.rule_id, rule_expression: 'domain(old.example)', rule_source: 'kernel'}
  ];
  expect(dictionaryView([rule], rules.generation_id, flows, [], [], t, 'en').rows[0].hits).toBe('2');
});

it('keeps suffix ambiguity unresolved while reusing explicit source identities', async () => {
  const api = createMockApi();
  const [rules, config] = await Promise.all([api.rules(), api.config()]);
  const source = config.sources[0];
  const rule = rules.rules[0];
  const sources = [
    {...source, id: 'a', path: '/a/config.dae'},
    {...source, id: 'b', path: '/b/config.dae'}
  ];
  const ambiguous = {...rule, source: {file: 'config.dae', line: 40}};
  const explicit = {...rule, rule_id: 'explicit', source: {file: 'config.dae', line: 40, source_id: 'b'}};
  const view = dictionaryView([ambiguous, explicit], undefined, undefined, sources, [], t, 'en');
  expect(view.rows[0]).toMatchObject({sourceQuery: null, removable: false});
  expect(view.rows[1]).toMatchObject({sourceQuery: 'tab=source&source=b&line=40', removable: true});
});
