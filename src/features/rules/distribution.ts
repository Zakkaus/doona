import type {FlowList, FlowSummary} from '../../api/model';

type RuleDistributionRow = {
  id: string | null;
  expression: string | null;
  source: FlowSummary['rule_source'];
  count: number;
  share: number;
};

export function ruleDistribution(flows: FlowSummary[]): RuleDistributionRow[] {
  const rows = new Map<string, RuleDistributionRow>();
  for (const flow of flows) {
    const id = flow.rule_id;
    const expression = id === null ? null : flow.rule_expression;
    const source = flow.rule_source;
    const key = JSON.stringify([id, expression, source]);
    const row = rows.get(key);
    if (row) row.count++;
    else rows.set(key, {id, expression, source, count: 1, share: 0});
  }
  const result = [...rows.values()];
  for (const row of result) row.share = row.count / flows.length;
  return result.sort((a, b) => b.count - a.count);
}

export function ruleDistributionSummary(list: FlowList) {
  return {total: list.flows.length, dropped: list.dropped_records, coverage: list.coverage};
}
