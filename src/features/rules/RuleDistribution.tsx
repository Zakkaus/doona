import {useMemo, useState} from 'react';
import {useFlows} from '../../api/store';
import {formatNumber, LOCALE, useLang, useT} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {usePalette} from '../../ui/Charts';
import {Badge, Bar, Segmented, ErrorMessage, Loading, TextTooltip} from '../../ui/ui';
import {ruleDistribution, ruleDistributionSummary} from './distribution';
import {Coverage} from '../flows/Coverage';

const sources: Record<string, Key> = {
  kernel: 'rule.sourceKernel',
  recomputed: 'rule.sourceRecomputed',
  unknown: 'rule.sourceUnknown'
};
// The retained flows grouped by the rule that decided them; recomputed from each snapshot, never accumulated.
export function RuleDistribution() {
  const resource = useFlows();
  const t = useT();
  const locale = LOCALE[useLang()];
  const palette = usePalette();
  const [source, setSource] = useState('all');
  const rows = useMemo(() => (resource.data ? ruleDistribution(resource.data.flows) : []), [resource.data]);
  const summary = resource.data ? ruleDistributionSummary(resource.data) : null;
  const filtered = source === 'all' ? rows : rows.filter(row => row.source === source);
  const visible = filtered.slice(0, 12);
  let otherCount = 0;
  for (let i = 12; i < filtered.length; i++) otherCount += filtered[i].count;
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
        {summary && summary.dropped === null && <Badge tone="warn">{t('rule.droppedUnknown')}</Badge>}
      </div>
      {resource.error && <ErrorMessage error={resource.error} />}
      {resource.loading && !summary && <Loading />}
      {summary && filtered.length === 0 && <div className="rp-empty">{t('rule.distributionEmpty')}</div>}
      {summary && filtered.length > 0 && (
        <div className="rp-card rp-list" role="list" aria-label={t('rule.distributionTitle')}>
          {visible.map(row => {
            const expression = row.id === null || row.expression === null ? t('rule.unknownRule') : row.expression;
            return (
              <div role="listitem" key={JSON.stringify([row.id, row.expression, row.source])}>
                <Bar
                  label={
                    <span className="rp-rule">
                      <TextTooltip text={row.id === null ? expression : t('rule.distributionRule', {expression, id: row.id})}>{expression}</TextTooltip>
                      <Badge>{t(sources[row.source])}</Badge>
                    </span>
                  }
                  value={t('rule.distributionValue', {n: formatNumber(row.count, locale), percent: formatNumber(row.share * 100, locale, 1)})}
                  pct={row.share * 100}
                  color={palette.cat[0]}
                />
              </div>
            );
          })}
          {filtered.length > 12 && (
            <div role="listitem">
              <Bar
                label={t('rule.distributionOther', {n: filtered.length - 12})}
                value={t('rule.distributionValue', {
                  n: formatNumber(otherCount, locale),
                  percent: formatNumber((otherCount / summary.total) * 100, locale, 1)
                })}
                pct={(otherCount / summary.total) * 100}
                color={palette.cat[0]}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
