import {useId, useMemo, useState} from 'react';
import {useFlows} from '../../api/store';
import {parseU64} from '../../api/u64';
import {formatNumber, LOCALE, useLang, useT} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {usePalette} from '../../ui/Charts';
import {Badge, Bar, Segmented} from '../../ui/ui';
import {ruleDistribution, ruleDistributionSummary} from './distribution';

const sources: Record<string, Key> = {
  kernel: 'rule.sourceKernel',
  recomputed: 'rule.sourceRecomputed',
  unknown: 'rule.sourceUnknown'
};
const coverageLabels: Record<string, Key> = {
  userspace_tcp: 'flow.userspaceTcp',
  userspace_udp: 'flow.userspaceUdp',
  kernel_direct: 'flow.kernelDirect',
  kernel_block: 'flow.kernelBlock',
  dns_intercept: 'flow.dnsIntercept',
  kernel_bypass: 'flow.kernelBypass'
};
const visibility: Record<string, Key> = {full: 'flow.full', partial: 'flow.partialVisibility', none: 'ui.none', unknown: 'ui.unknown'};

export function RuleDistribution() {
  const resource = useFlows();
  const t = useT();
  const locale = LOCALE[useLang()];
  const palette = usePalette();
  const titleId = useId();
  const [source, setSource] = useState('all');
  const rows = useMemo(() => (resource.data ? ruleDistribution(resource.data.flows) : []), [resource.data]);
  const summary = resource.data ? ruleDistributionSummary(resource.data) : null;
  const filtered = source === 'all' ? rows : rows.filter(row => row.source === source);
  const visible = filtered.slice(0, 12);
  let otherCount = 0;
  for (let i = 12; i < filtered.length; i++) otherCount += filtered[i].count;

  return (
    <section className="rp-card" aria-labelledby={titleId}>
      <div className="rp-row">
        <span className="rp-title" id={titleId}>
          {t('rule.distributionTitle')}
        </span>
        <Segmented
          label={t('rule.distributionSource')}
          value={source}
          onChange={setSource}
          items={[['all', t('ui.all')], ...Object.entries(sources).map(([id, label]): [string, string] => [id, t(label)])]}
        />
      </div>
      {resource.error && (
        <p role="alert" className="rp-note">
          {t('flow.loadFailed', {error: resource.error.message})}
        </p>
      )}
      {resource.loading && !summary && <p role="status">{t('ui.loading')}</p>}
      {summary && (
        <>
          <p className="rp-note">{t('rule.distributionCaption', {n: formatNumber(summary.total, locale)})}</p>
          <p className="rp-note">{t('rule.distributionScope')}</p>
          <div className="rp-toolbar" aria-label={t('flow.coverage')}>
            {Object.entries(summary.coverage).map(([scope, coverage]) => (
              <Badge key={scope} tone={coverage === 'full' ? undefined : 'warn'}>
                {t('ui.valuePair', {label: t(coverageLabels[scope]), value: t(visibility[coverage])})}
              </Badge>
            ))}
            {summary.dropped === null ? (
              <Badge tone="warn">{t('rule.droppedUnknown')}</Badge>
            ) : (
              parseU64(summary.dropped)! > 0n && <Badge tone="warn">{t('rule.droppedRecords', {n: summary.dropped})}</Badge>
            )}
          </div>
          <div className="rp-legend">
            <span className="it">
              <i className="sw" style={{background: palette.cat[0]}} />
              {t('rule.snapshotShare')}
            </span>
          </div>
          {filtered.length === 0 ? (
            <p className="rp-note">{t('rule.distributionEmpty')}</p>
          ) : (
            <div className="rp-list" role="list" aria-label={t('rule.distributionTitle')}>
              {visible.map(row => {
                const expression = row.id === null || row.expression === null ? t('rule.unknownRule') : row.expression;
                return (
                  <div className="rp-bar" role="listitem" key={JSON.stringify([row.id, row.expression, row.source])}>
                    <div className="top">
                      <span className="l rp-rule">
                        <span title={row.id === null ? expression : t('rule.distributionRule', {expression, id: row.id})}>{expression}</span>
                        <small className="rp-provenance">{t(sources[row.source])}</small>
                      </span>
                      <span className="v">
                        {t('rule.distributionValue', {n: formatNumber(row.count, locale), percent: formatNumber(row.share * 100, locale, 1)})}
                      </span>
                    </div>
                    <div className="track" aria-hidden="true">
                      <div className="fill" style={{width: `${row.share * 100}%`, background: palette.cat[0]}} />
                    </div>
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
        </>
      )}
    </section>
  );
}
