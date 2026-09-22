import Download from '../../ui/icons/Download';
import Upload from '../../ui/icons/Upload';
import LinkIcon from '../../ui/icons/Link';
import Data from '../../ui/icons/Data';
import {useT} from '../../i18n';
import {CardLink, Segmented, Light, ErrorMessage, Loading, Empty, Link} from '../../ui/ui';
import {buildHash} from '../../shell/route';
import {AreaChart, Legend, Spark} from '../../ui/Charts';
import {ModeCards} from './ModeSwitch';
import {Notices} from './Notices';
import {useActivity} from './useActivity';
import {NodeCard} from './NodeCard';
import {OutboundsCard} from './OutboundsCard';
import {RankingCard} from './RankingCard';

export function Activity() {
  const t = useT();
  const vm = useActivity();
  const {p, locale, range, setRange, traffic, spark, chartRate, memorySeries, memoryBytes, notices} = vm;
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
          {vm.history.error && vm.history.state !== 'ready' ? (
            <ErrorMessage error={vm.history.error} />
          ) : vm.history.state === 'unavailable' ? (
            <div className="rp-chart-wait tall">
              <span className="rp-label">{t('act.noHistory')}</span>
            </div>
          ) : vm.history.state === 'loading' ? (
            <div className="rp-chart-wait tall">
              <Loading>{t('act.loading')}</Loading>
            </div>
          ) : vm.history.state === 'empty' ? (
            <div className="rp-chart-wait tall">
              <Empty>{t('act.emptyHistory')}</Empty>
            </div>
          ) : (
            <>
              <Legend series={traffic} fmt={chartRate} />
              <AreaChart
                label={t('act.traffic')}
                series={traffic}
                timestamps={vm.trafficTimestamps}
                fmt={chartRate}
                locale={locale}
                height={120}
                fill
                window={vm.trafficBounds}
              />
            </>
          )}
        </section>
        <OutboundsCard />
      </div>

      <div className="rp-g3">
        <RankingCard />
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
                label={t('act.memory')}
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
