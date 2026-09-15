import {expect, it} from 'vitest';
import type {FlowSummary} from '../../api/model';
import {flows} from '../../api/mock/fixtures';
import {ruleDistribution} from './distribution';

const flow: FlowSummary = {...flows[0], rule_id: 'r1', rule_expression: 'domain(suffix: example.com)', rule_source: 'kernel'};

it('separates sources, expressions and IDs rather than treating an ID as a global rule', () => {
  const input = [
    flow,
    {...flow, rule_source: 'recomputed' as const},
    {...flow, rule_source: 'unknown' as const},
    {...flow, rule_expression: 'dip(geoip:cn)'},
    {...flow, rule_id: 'r2'},
    {...flow, rule_expression: null}
  ];
  expect(ruleDistribution(input)).toEqual(
    input.map(item => ({id: item.rule_id, expression: item.rule_expression, source: item.rule_source, count: 1, share: 1 / input.length}))
  );
});

it('groups null rules into one unknown-rule bucket per source', () => {
  const unknown = {...flow, rule_id: null, rule_expression: null};
  expect(
    ruleDistribution([
      unknown,
      {...unknown, rule_expression: 'unidentified expression'},
      {...unknown, rule_source: 'recomputed'},
      {...unknown, rule_source: 'unknown'}
    ])
  ).toEqual([
    {id: null, expression: null, source: 'kernel', count: 2, share: 0.5},
    {id: null, expression: null, source: 'recomputed', count: 1, share: 0.25},
    {id: null, expression: null, source: 'unknown', count: 1, share: 0.25}
  ]);
});

it('sorts snapshot counts and computes shares without accumulating repeated polls', () => {
  const second = {...flow, rule_id: 'r2'};
  const input = [flow, second, {...second, id: 'another-flow'}];
  const rows = ruleDistribution(input);
  expect(rows.map(row => [row.id, row.count, row.share])).toEqual([
    ['r2', 2, 2 / 3],
    ['r1', 1, 1 / 3]
  ]);
  expect(rows.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1);
  expect(ruleDistribution(input)).toEqual(rows);
  expect(ruleDistribution([second])).toEqual([{id: 'r2', expression: flow.rule_expression, source: 'kernel', count: 1, share: 1}]);
});

it('returns no distribution for an empty snapshot', () => {
  expect(ruleDistribution([])).toEqual([]);
});
