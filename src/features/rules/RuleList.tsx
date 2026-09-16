import {useMemo, useState} from 'react';
import {useFlows} from '../../api/store';
import {formatNumber, LOCALE, useLang, useT} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {Badge, DataTable, Light, Segmented, ErrorMessage, TextTooltip} from '../../ui/ui';
import {ruleDistribution, ruleDistributionSummary} from './distribution';
import {Coverage} from '../flows/Coverage';

const sources: Record<string, Key> = {
  kernel: 'rule.sourceKernel',
  recomputed: 'rule.sourceRecomputed',
  unknown: 'rule.sourceUnknown'
};

// Rule IDs sort in config order when they carry a number; the rest keep their text order.
const ruleOrder = (a: string | null, b: string | null) => {
  if (a === null || b === null) return Number(a === null) - Number(b === null);
  return a.localeCompare(b, undefined, {numeric: true});
};

// The rules as a list: which ones decided the retained flows, how often, and where the decision came from.
// The full config list joins once the contract exposes one; the editor lands beside it.
export function RuleList() {
  const resource = useFlows();
  const t = useT();
  const locale = LOCALE[useLang()];
  const [source, setSource] = useState('all');
  const rows = useMemo(
    () =>
      (resource.data ? ruleDistribution(resource.data.flows) : [])
        .map((row, i) => ({...row, key: String(i)}))
        .sort((a, b) => ruleOrder(a.id, b.id) || b.count - a.count),
    [resource.data]
  );
  const summary = resource.data ? ruleDistributionSummary(resource.data) : null;
  const filtered = source === 'all' ? rows : rows.filter(row => row.source === source);
  return (
    <div className="rp-col">
      <div className="rp-toolbar">
        <Segmented
          label={t('rule.distributionSource')}
          value={source}
          onChange={setSource}
          items={[['all', t('ui.all')], ...Object.entries(sources).map(([id, label]): [string, string] => [id, t(label)])]}
        />
        {summary && (
          <TextTooltip text={t('rule.distributionScope')} className="rp-label">
            {t('rule.distributionCaption', {n: formatNumber(summary.total, locale)})}
          </TextTooltip>
        )}
        {summary && <Coverage data={{coverage: summary.coverage, dropped_records: summary.dropped}} />}
        {summary && summary.dropped === null && (
          <Light small tone="warn">
            {t('rule.droppedUnknown')}
          </Light>
        )}
      </div>
      {resource.error && <ErrorMessage error={resource.error} />}
      <DataTable
        label={t('rule.listTitle')}
        loading={resource.loading && !resource.data}
        rows={filtered.map(row => ({...row, id: row.key}))}
        empty={t('rule.distributionEmpty')}
        cols={[
          {id: 'n', label: t('rule.id'), minWidth: 72, grow: 0, drop: 2},
          {id: 'expression', label: t('rule.expression'), minWidth: 240, grow: 3, isRowHeader: true},
          {id: 'source', label: t('rule.distributionSource'), minWidth: 96, grow: 0, drop: 1},
          {id: 'hits', label: t('rule.hits'), minWidth: 72, grow: 0, align: 'end'},
          {id: 'share', label: t('rule.share'), minWidth: 72, grow: 0, align: 'end', drop: 3}
        ]}
        render={row => [
          row.id ?? '—',
          <TextTooltip className={row.expression ? 'rp-code' : undefined}>{row.expression ?? t('rule.unknownRule')}</TextTooltip>,
          <Badge>{t(sources[row.source])}</Badge>,
          formatNumber(row.count, locale),
          formatNumber(row.share * 100, locale, 1) + '%'
        ]}
      />
    </div>
  );
}
