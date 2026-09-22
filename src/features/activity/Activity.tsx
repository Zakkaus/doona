import Download from '../../ui/icons/Download';
import Upload from '../../ui/icons/Upload';
import LinkIcon from '../../ui/icons/Link';
import Data from '../../ui/icons/Data';
import {useT} from '../../i18n';
import {Badge, CardLink, Segmented, Light, Bar, ErrorMessage, Loading, TextTooltip, Empty, Link} from '../../ui/ui';
import {buildHash} from '../../shell/route';
import {AreaChart, Donut, Legend, Spark} from '../../ui/Charts';
import {ModeCards} from './ModeSwitch';
import {Notices} from './Notices';
import {useActivity} from './useActivity';
import {NodeCard} from './NodeCard';

export function Activity() {
  const t = useT();
  const vm = useActivity();
  const {p, locale, range, setRange, by, setBy, traffic, spark, chartRate, memorySeries, memoryBytes, notices} = vm;
  const alert = vm.error && <ErrorMessage error={vm.error} onRetry={vm.retry} />;
  if (!vm.ready) return alert || <Loading>{t('act.loading')}</Loading>;
  return (
    <>
      {alert}
      <div className="rp-quick">
        <ModeCards model={vm.mode} />
        <div className="rp-card">
          <div className="rp-row">
            <Light tone={vm.status.tone}>{vm.status.text}</Light>
            <Link appearance="button" className="quiet" href={buildHash('overview')}>
              {t('act.viewDetails')}
            </Link>
          </div>
        </div>
      </div>

      <div className="rp-strip">
        <div className="rp-card">
          <span className="rp-tile-head rp-tint-c1">
            <Download />
            {t('act.download')}
          </span>
          <div className="rp-tile-body">
            <span className="rp-tile-val">
              <span className="rp-big">{vm.download}</span>
            </span>
            <span className="rp-spark">
              <Spark values={spark.down} timestamps={spark.timestamps} color={p.cat[0]} floor={100} />
            </span>
          </div>
        </div>
        <div className="rp-card">
          <span className="rp-tile-head rp-tint-c4">
            <Upload />
            {t('act.upload')}
          </span>
          <div className="rp-tile-body">
            <span className="rp-tile-val">
              <span className="rp-big">{vm.upload}</span>
            </span>
            <span className="rp-spark">
              <Spark values={spark.up} timestamps={spark.timestamps} color={p.cat[3]} floor={100} />
            </span>
          </div>
        </div>
        <CardLink href={buildHash('connections')} label={t('act.active')}>
          <span className="rp-tile-head rp-tint-c3">
            <LinkIcon />
            {t('act.active')}
          </span>
          <div className="rp-tile-body">
            <span className="rp-tile-val">
              <span className="rp-big">{vm.connections}</span>
            </span>
            <span className="rp-spark">
              <Spark values={spark.connections} timestamps={spark.timestamps} color={p.cat[2]} />
            </span>
          </div>
        </CardLink>
        <NodeCard />
        {vm.showMemory && (
          <div className="rp-card">
            <span className="rp-tile-head rp-tint-c2">
              <Data />
              {t('act.memory')}
            </span>
            <div className="rp-tile-body">
              <span className="rp-tile-val">
                <span className="rp-big">{vm.rss}</span>
              </span>
              {vm.memoryBadge && (
                <Light small tone={vm.memoryBadge.tone}>
                  {vm.memoryBadge.text}
                </Light>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="rp-g21">
        <section className="rp-card" aria-labelledby="activity-traffic">
          <div className="rp-row">
            <h3 className="rp-h3" id="activity-traffic">
              {t('act.traffic')}
            </h3>
            <Segmented
              label={t('act.historyRange')}
              value={range}
              onChange={setRange}
              items={[
                ['live', t('act.live')],
                ['m10', t('act.m10')],
                ['h1', t('act.h1')],
                ['h6', t('act.h6')],
                ['h24', t('act.h24')],
                ['d7', t('act.d7')]
              ]}
            />
          </div>
          {vm.history.error ? (
            <ErrorMessage error={vm.history.error} />
          ) : vm.history.state === 'unavailable' ? (
            <span className="rp-label">{t('act.noHistory')}</span>
          ) : vm.history.state === 'loading' ? (
            <Loading>{t('act.loading')}</Loading>
          ) : vm.history.state === 'empty' ? (
            <Empty>{t('act.emptyHistory')}</Empty>
          ) : (
            <>
              <Legend series={traffic} fmt={chartRate} />
              <AreaChart series={traffic} timestamps={vm.trafficTimestamps} fmt={chartRate} locale={locale} height={120} fill window={vm.trafficBounds} />
            </>
          )}
        </section>
        <div className="rp-card">
          <div className="rp-row">
            <div className="rp-cluster">
              <h3 className="rp-h3">{t('act.outUsage')}</h3>
              {vm.outbounds.since && <span className="rp-label">{vm.outbounds.since}</span>}
            </div>
          </div>
          {vm.outboundState.error ? (
            <ErrorMessage error={vm.outboundState.error} />
          ) : vm.outboundState.state === 'unavailable' ? (
            <span className="rp-label">{t('act.noOutbounds')}</span>
          ) : vm.outboundState.state === 'loading' ? (
            <Loading>{t('act.loading')}</Loading>
          ) : vm.outboundState.state === 'empty' ? (
            <Empty>{t('ui.empty')}</Empty>
          ) : (
            <Donut rows={vm.outbounds.rows} total={vm.outbounds.total} />
          )}
        </div>
      </div>

      <div className="rp-g3">
        <div className="rp-card">
          <div className="rp-row">
            <TextTooltip text={t('act.rankingScope')}>
              <h3 className="rp-h3">{t('act.topDevices')}</h3>
            </TextTooltip>
            <Segmented
              label={t('act.topDevices')}
              value={by}
              onChange={setBy}
              items={[
                ['dev', t('act.devices')],
                ['host', t('act.domains')]
              ]}
            />
          </div>
          {vm.rankingState.error && <ErrorMessage error={vm.rankingState.error} />}
          {vm.rankingState.truncated && (
            <TextTooltip text={t('act.rankingTruncated')}>
              <Badge tone="warn">{t('act.truncated')}</Badge>
            </TextTooltip>
          )}
          {vm.rankingState.state === 'error' ? null : vm.rankingState.state === 'loading' ? (
            <Loading>{t('act.loading')}</Loading>
          ) : vm.rankingState.state === 'unavailable' ? (
            <Empty>{t('shell.notOfferedShort')}</Empty>
          ) : vm.rankingState.state === 'empty' ? (
            <Empty>{t('act.rankingEmpty')}</Empty>
          ) : (
            <div className="rp-list">
              {vm.ranking.map(row => (
                <Bar key={row.name} label={row.name} value={row.value} pct={row.pct} color={row.color} />
              ))}
            </div>
          )}
        </div>
        <section className="rp-card" aria-labelledby="activity-memory">
          <div className="rp-row">
            <h3 className="rp-h3" id="activity-memory">
              {t('act.memory')}
            </h3>
            <Link appearance="button" className="quiet sm" href={buildHash('overview')}>
              {t('act.viewDetails')}
            </Link>
          </div>
          {vm.memoryState.error ? (
            <ErrorMessage error={vm.memoryState.error} />
          ) : vm.memoryState.state === 'ready' ? (
            <>
              <Legend series={memorySeries} fmt={memoryBytes} />
              <AreaChart
                series={memorySeries}
                timestamps={vm.memoryTimestamps}
                fmt={memoryBytes}
                locale={locale}
                height={150}
                fill
                baseline="auto"
                window={vm.memoryBounds}
              />
            </>
          ) : vm.memoryState.state === 'unavailable' ? (
            <Empty>{t('act.noHistory')}</Empty>
          ) : (
            <div className="rp-chart-wait">
              <Loading>{t('act.sampling')}</Loading>
            </div>
          )}
        </section>
        <Notices {...notices} />
      </div>
    </>
  );
}
