import {expect, it} from 'vitest';
import type {FlowSummary} from '../../api/model';
import {flowGraph, flowNodeLabel, graphStages, unknownLabels} from './graph';

const proxy: FlowSummary = {
  id: 'proxy-1',
  instance_id: 'instance',
  revision: 1,
  network: 'tcp',
  state: 'active',
  pname: null,
  connection_id: null,
  outbound: 'proxy',
  chain: ['proxy'],
  chain_source: 'evaluation',
  rule_id: 'rule-proxy',
  rule_expression: 'proxy',
  rule_source: 'kernel',
  ingress: null,
  domain_source: null,
  observed_by: 'userspace',
  started_at: null,
  ended_at: null,
  trace_status: 'partial',
  input: {
    src: '10.0.0.1:1000',
    dst: null,
    domain: null,
    domain_source: null,
    pid: null,
    process_path: null,
    src_mac: null,
    ingress: null,
    domain_rule_ids: null,
    dscp: null,
    mark: null
  }
};
const {input, ...withoutInput} = proxy;
const gaps: FlowSummary = {
  ...withoutInput,
  id: 'gaps',
  rule_id: null,
  rule_expression: null,
  rule_source: 'unknown',
  chain: [],
  chain_source: 'unknown',
  outbound: null
};
const fixtures: FlowSummary[] = [
  proxy,
  {...proxy, id: 'proxy-2', input: {...input!, src: '10.0.0.1:2000'}},
  gaps,
  {...proxy, id: 'ipv6-port', input: {...input!, src: '[2001:db8::1]:443'}, chain: ['proxy', 'leaf']},
  {...proxy, id: 'ipv6-host', input: {...input!, src: '2001:db8::1'}, chain: ['proxy', 'leaf']},
  {...proxy, id: 'direct', outbound: 'direct', chain: [], chain_source: 'unknown', rule_expression: 'lan'},
  {...proxy, id: 'block', state: 'blocked', outbound: 'block', chain: [], chain_source: 'unknown', rule_expression: 'ads'}
];

it('counts each retained flow once per stage and conserves link counts up to terminals', () => {
  const {nodes, links} = flowGraph(fixtures);
  for (const stage of graphStages) {
    expect(nodes.filter(node => node.stage === stage).reduce((sum, node) => sum + node.count, 0)).toBe(stage === 'outbound' ? 5 : 7);
  }
  for (const node of nodes) {
    if (node.stage !== 'source') expect(links.filter(link => link.target === node.id).reduce((sum, link) => sum + link.count, 0)).toBe(node.count);
    const terminal = node.stage === 'chain' && (node.label === 'direct' || node.label === 'block');
    expect(links.filter(link => link.source === node.id).reduce((sum, link) => sum + link.count, 0)).toBe(
      terminal || node.stage === 'outbound' ? 0 : node.count
    );
  }
  expect(nodes.filter(node => node.stage === 'outbound').map(node => node.label)).toEqual(['proxy', unknownLabels.outbound]);
  expect(flowGraph([])).toEqual({nodes: [], links: []});
});

it('merges hosts across ports and links across flows without merging stage identities', () => {
  const {nodes, links} = flowGraph(fixtures.slice(0, 2));
  expect(nodes).toEqual([
    {id: 'source:10.0.0.1', stage: 'source', label: '10.0.0.1', count: 2},
    {id: 'rule:proxy', stage: 'rule', label: 'proxy', count: 2},
    {id: 'chain:proxy', stage: 'chain', label: 'proxy', count: 2},
    {id: 'outbound:proxy', stage: 'outbound', label: 'proxy', count: 2}
  ]);
  expect(links).toEqual([
    {source: 'source:10.0.0.1', target: 'rule:proxy', count: 2},
    {source: 'rule:proxy', target: 'chain:proxy', count: 2},
    {source: 'chain:proxy', target: 'outbound:proxy', count: 2}
  ]);
  const ipv6 = flowGraph(fixtures.slice(3, 5));
  expect(ipv6.nodes.find(node => node.stage === 'source')).toEqual({id: 'source:[2001:db8::1]', stage: 'source', label: '[2001:db8::1]', count: 2});
  expect(ipv6.nodes.find(node => node.stage === 'chain')?.label).toBe('proxy → leaf');
});

it('preserves unavailable evidence as message keys and uses the same labels for filtering', () => {
  const {nodes} = flowGraph([gaps]);
  expect(nodes.map(node => node.label)).toEqual(Object.values(unknownLabels));
  expect(flowNodeLabel({...proxy, input: {...input!, src: null}}, 'source')).toBe(unknownLabels.source);
  expect(flowNodeLabel({...proxy, chain: []}, 'chain')).toBe(unknownLabels.chain);
  expect(flowNodeLabel({...proxy, chain_source: 'unknown'}, 'chain')).toBe(unknownLabels.chain);
  for (const node of flowGraph(fixtures).nodes) {
    expect(fixtures.filter(flow => flowNodeLabel(flow, node.stage) === node.label)).toHaveLength(node.count);
  }
});
