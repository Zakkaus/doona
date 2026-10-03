import {DeferredLoading} from './DeferredLoading';
import Download from '../../ui/icons/Download';
import Upload from '../../ui/icons/Upload';
import LinkIcon from '../../ui/icons/Link';
import Cpu from '../../ui/icons/Cpu';
import {useT} from '../../i18n';
import {Card, CardLink, ContextualHelp, Segmented, Light, ErrorMessage, Empty, Link, ChartWait, ValueTile} from '../../ui/ui';
import {href} from '../../shell/route';
import {AreaChart, FactStrip, Legend, Spark} from '../../ui/charts';
import {ModeCards} from './ModeSwitch';
import {useMode} from '../shared/useMode';
import {seriesFacts} from '../shared/widgetSeries';
import {useNotices} from './useNotices';
import {Notices} from './Notices';
import {useActivity} from './useActivity';
import {NodeCard} from './NodeCard';
import {OutboundsCard} from './OutboundsCard';
import {RankingCard} from './RankingCard';
import {useRankingCard} from './useRankingCard';

export function ActivityCard({
  item,
  scale = 1,
  selection,
  ranking
}: {
  item: {id: string; rows?: number; width?: string};
  // A chart's height as a multiple of its standard height.
  scale?: number;
  ranking?: {by: string; setBy: (by: string) => void};
  selection?: {chosen: string; setChosen: (id: string) => void};
}) {
  // A card two thirds of a row or wider lists its chart's peak and average beside it (see dashboard.css).
  const stats = item.width === '2/3' || item.width === 'full';
  switch (item.id) {
    case 'mode':
      return <ModeModule part="mode" />;
    case 'global':
      return <ModeModule part="global" />;
    case 'latency':
      return <NodeCard connections={undefined} selection={selection} stats={stats} />;
    case 'ranking':
      return <RankingModule selection={ranking} limit={item.rows} />;
    case 'notices':
      return <NoticesModule />;
    case 'outbounds':
      return <OutboundsCard />;
    case 'download':
    case 'upload':
    case 'connections':
    case 'cpu':
    case 'history':
    case 'memory':
    case 'status':
      return <MetricModule kind={item.id} scale={scale} stats={stats} />;
    default:
      return null;
  }
}
function ModeModule({part}: {part: 'mode' | 'global'}) {
  return <ModeCards model={useMode()} part={part} />;
}

function RankingModule({selection, limit}: {selection?: {by: string; setBy: (by: string) => void}; limit?: number}) {
  return <RankingCard model={useRankingCard(true, selection, limit)} />;
}
function NoticesModule() {
  return <Notices {...useNotices()} />;
}
// The status card carries the runtime read's error; without it, the dashboard shows the same error and retry above
// the cards that read runtime.
export function RuntimeAlert() {
  const vm = useActivity('status');
  return vm.error ? <ErrorMessage error={vm.error} onRetry={vm.retry} /> : null;
}
function MetricModule({kind, scale, stats: wide}: {kind: Parameters<typeof useActivity>[0]; scale: number; stats: boolean}) {
  const t = useT();
  const vm = useActivity(kind);
  const {p, locale, range, ranges, setRange, traffic, spark, sparklines, cpuSpark, chartRate, count, cpuText, memorySeries, memoryBytes} = vm;
  const big = vm.stale ? 'rp-big rp-muted' : 'rp-big';
  const alert = kind === 'status' && vm.error && <ErrorMessage error={vm.error} onRetry={vm.retry} />;
  const stats = (label: string, values: (number | null)[], fmt: (value: number) => string) =>
    wide && <FactStrip facts={seriesFacts([{label, values}], fmt, t)} />;
  if (!vm.ready) return alert || (vm.discoveryFailed ? null : <DeferredLoading>{t('ui.loading')}</DeferredLoading>);
  let content;
  switch (kind) {
    case 'status':
      content = (
        <Card className="rp-control-card">
          <div className="rp-row" data-pack="line">
            <Light tone={vm.status.tone}>{vm.status.text}</Light>
            <div className="rp-control-tail">
              <Link appearance="button" quiet href={href('overview')}>
                {vm.limited ?? t('act.viewDetails')}
              </Link>
            </div>
          </div>
        </Card>
      );
      break;
    case 'download':
      content = (
        <CardLink href={href('connections', {tab: 'traffic'})} label={t('act.download')} tile={{icon: <Download />, tint: 1}}>
          <ValueTile
            value={<span className={big}>{vm.download}</span>}
            spark={sparklines && <Spark values={spark.down} timestamps={spark.timestamps} color={p.cat[0]} floor={100} fmt={chartRate} locale={locale} />}
            facts={stats(t('act.download'), spark.down, chartRate)}
          />
        </CardLink>
      );
      break;
    case 'upload':
      content = (
        <CardLink href={href('connections', {tab: 'traffic'})} label={t('act.upload')} tile={{icon: <Upload />, tint: 4}}>
          <ValueTile
            value={<span className={big}>{vm.upload}</span>}
            spark={sparklines && <Spark values={spark.up} timestamps={spark.timestamps} color={p.cat[3]} floor={100} fmt={chartRate} locale={locale} />}
            facts={stats(t('act.upload'), spark.up, chartRate)}
          />
        </CardLink>
      );
      break;
    case 'connections':
      content = (
        <CardLink href={href('connections', {tab: 'list'})} label={t('act.active')} tile={{icon: <LinkIcon />, tint: 3}}>
          <ValueTile
            value={<span className={big}>{vm.connections}</span>}
            spark={sparklines && <Spark values={spark.connections} timestamps={spark.timestamps} color={p.cat[2]} fmt={count} locale={locale} />}
            facts={stats(t('act.active'), spark.connections, count)}
          />
        </CardLink>
      );
      break;
    case 'cpu':
      content = (
        <Card title={t('act.cpu')} tile={{icon: <Cpu />, tint: 2, kind: 'metric'}} aside={<ContextualHelp {...vm.cpuHelp} />}>
          <ValueTile
            // The value opens the overview, where the engine's process figures sit.
            value={
              <Link appearance="link" href={href('overview')} label={t('ui.valuePair', {label: t('act.cpu'), value: vm.cpu})}>
                <span className={big}>{vm.cpu}</span>
              </Link>
            }
            // Percent of one core: the line keeps a 0 to 100 scale and grows only past one busy core.
            spark={sparklines && <Spark values={cpuSpark.values} timestamps={cpuSpark.timestamps} color={p.cat[1]} floor={100} fmt={cpuText} locale={locale} />}
            facts={stats(t('act.cpu'), cpuSpark.values, cpuText)}
          />
        </Card>
      );
      break;
    case 'history':
      content = (
        <Card title={t('act.traffic')} aside={<Segmented label={t('act.historyRange')} value={range} onChange={setRange} items={ranges} />}>
          {vm.history.error && vm.history.state !== 'ready' ? (
            <ErrorMessage error={vm.history.error} onRetry={vm.history.retry} />
          ) : vm.history.state === 'unavailable' ? (
            <ChartWait holds="tall">
              <Empty>{t('act.noHistory')}</Empty>
            </ChartWait>
          ) : vm.history.state === 'loading' ? (
            <ChartWait holds="tall">
              <DeferredLoading>{t('ui.loading')}</DeferredLoading>
            </ChartWait>
          ) : vm.history.state === 'empty' ? (
            <ChartWait holds="tall">
              <Empty>{t('act.emptyHistory')}</Empty>
            </ChartWait>
          ) : (
            <div className="rp-chart-stats">
              <Legend series={traffic} fmt={chartRate} />
              <AreaChart
                label={t('act.traffic')}
                series={traffic}
                timestamps={vm.trafficTimestamps}
                fmt={chartRate}
                locale={locale}
                height={120 * scale}
                fill
                window={vm.trafficBounds}
              />
              {wide && <FactStrip facts={seriesFacts(traffic, chartRate, t)} />}
            </div>
          )}
        </Card>
      );
      break;
    case 'memory':
      content = (
        <Card
          title={t('act.memory')}
          aside={
            <Link appearance="button" quiet small href={href('overview')}>
              {t('act.viewDetails')}
            </Link>
          }
        >
          {vm.memoryState.error ? (
            <ErrorMessage error={vm.memoryState.error} onRetry={vm.memoryState.retry} />
          ) : vm.memoryState.state === 'ready' ? (
            <div className="rp-chart-stats">
              <Legend series={memorySeries} fmt={memoryBytes} />
              <AreaChart
                label={t('act.memory')}
                series={memorySeries}
                timestamps={vm.memoryTimestamps}
                fmt={memoryBytes}
                locale={locale}
                height={150 * scale}
                fill
                baseline="auto"
                window={vm.memoryBounds}
              />
              {wide && <FactStrip facts={seriesFacts(memorySeries, memoryBytes, t)} />}
            </div>
          ) : vm.memoryState.state === 'unavailable' ? (
            <Empty>{t('act.noHistory')}</Empty>
          ) : (
            <ChartWait>
              <DeferredLoading>{t('act.sampling')}</DeferredLoading>
            </ChartWait>
          )}
        </Card>
      );
      break;
  }
  return (
    <>
      {alert}
      {content}
    </>
  );
}
