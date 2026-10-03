import {DeferredLoading} from './DeferredLoading';
import Download from '../../ui/icons/Download';
import Upload from '../../ui/icons/Upload';
import LinkIcon from '../../ui/icons/Link';
import Cpu from '../../ui/icons/Cpu';
import {useT} from '../../i18n';
import {Card, CardLink, ContextualHelp, Segmented, Light, ErrorMessage, Empty, Link} from '../../ui/ui';
import {href} from '../../shell/route';
import {AreaChart, Legend, Spark} from '../../ui/charts';
import {ModeCards} from './ModeSwitch';
import {useMode} from '../shared/useMode';
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
  item: {id: string; rows?: number};
  // A chart's height as a multiple of its standard height.
  scale?: number;
  ranking?: {by: string; setBy: (by: string) => void};
  selection?: {chosen: string; setChosen: (id: string) => void};
}) {
  switch (item.id) {
    case 'mode':
      return <ModeModule part="mode" />;
    case 'global':
      return <ModeModule part="global" />;
    case 'latency':
      return <LatencyModule selection={selection} />;
    case 'ranking':
      return <RankingModule selection={ranking} limit={item.rows} />;
    case 'notices':
      return <NoticesModule limit={item.rows} />;
    case 'outbounds':
      return <OutboundsCard />;
    case 'download':
    case 'upload':
    case 'connections':
    case 'cpu':
    case 'history':
    case 'memory':
    case 'status':
      return <MetricModule kind={item.id} scale={scale} />;
    default:
      return null;
  }
}
function ModeModule({part}: {part: 'mode' | 'global'}) {
  return <ModeCards model={useMode()} part={part} />;
}
function LatencyModule({selection}: {selection?: {chosen: string; setChosen: (id: string) => void}}) {
  return <NodeCard connections={undefined} selection={selection} />;
}

function RankingModule({selection, limit}: {selection?: {by: string; setBy: (by: string) => void}; limit?: number}) {
  return <RankingCard model={useRankingCard(true, selection, limit)} />;
}
function NoticesModule({limit}: {limit?: number}) {
  return <Notices {...useNotices()} limit={limit} />;
}
// The status card carries the runtime read's error; without it, the dashboard shows the same error and retry above
// the cards that read runtime.
export function RuntimeAlert() {
  const vm = useActivity('status');
  return vm.error ? <ErrorMessage error={vm.error} onRetry={vm.retry} /> : null;
}
function MetricModule({kind, scale}: {kind: Parameters<typeof useActivity>[0]; scale: number}) {
  const t = useT();
  const vm = useActivity(kind);
  const {p, locale, range, ranges, setRange, traffic, spark, sparklines, cpuSpark, chartRate, count, cpuText, memorySeries, memoryBytes} = vm;
  const big = vm.stale ? 'rp-big rp-muted' : 'rp-big';
  const alert = kind === 'status' && vm.error && <ErrorMessage error={vm.error} onRetry={vm.retry} />;
  if (!vm.ready) return alert || (vm.discoveryFailed ? null : <DeferredLoading>{t('ui.loading')}</DeferredLoading>);
  let content;
  switch (kind) {
    case 'status':
      content = (
        <Card className="rp-control-card">
          <div className="rp-row">
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
          <div className="rp-tile-body">
            <span className="rp-tile-val">
              <span className={big}>{vm.download}</span>
            </span>
            {sparklines && (
              <span className="rp-spark">
                <Spark values={spark.down} timestamps={spark.timestamps} color={p.cat[0]} floor={100} fmt={chartRate} locale={locale} />
              </span>
            )}
          </div>
        </CardLink>
      );
      break;
    case 'upload':
      content = (
        <CardLink href={href('connections', {tab: 'traffic'})} label={t('act.upload')} tile={{icon: <Upload />, tint: 4}}>
          <div className="rp-tile-body">
            <span className="rp-tile-val">
              <span className={big}>{vm.upload}</span>
            </span>
            {sparklines && (
              <span className="rp-spark">
                <Spark values={spark.up} timestamps={spark.timestamps} color={p.cat[3]} floor={100} fmt={chartRate} locale={locale} />
              </span>
            )}
          </div>
        </CardLink>
      );
      break;
    case 'connections':
      content = (
        <CardLink href={href('connections', {tab: 'list'})} label={t('act.active')} tile={{icon: <LinkIcon />, tint: 3}}>
          <div className="rp-tile-body">
            <span className="rp-tile-val">
              <span className={big}>{vm.connections}</span>
            </span>
            {sparklines && (
              <span className="rp-spark">
                <Spark values={spark.connections} timestamps={spark.timestamps} color={p.cat[2]} fmt={count} locale={locale} />
              </span>
            )}
          </div>
        </CardLink>
      );
      break;
    case 'cpu':
      content = (
        <Card title={t('act.cpu')} tile={{icon: <Cpu />, tint: 2, kind: 'metric'}} aside={<ContextualHelp {...vm.cpuHelp} />}>
          <div className="rp-tile-body">
            <span className="rp-tile-val">
              {/* The value opens the overview, where the engine's process figures sit. */}
              <Link appearance="link" href={href('overview')} label={t('ui.valuePair', {label: t('act.cpu'), value: vm.cpu})}>
                <span className={big}>{vm.cpu}</span>
              </Link>
            </span>
            {sparklines && (
              <span className="rp-spark">
                {/* Percent of one core: the line keeps a 0 to 100 scale and grows only past one busy core. */}
                <Spark values={cpuSpark.values} timestamps={cpuSpark.timestamps} color={p.cat[1]} floor={100} fmt={cpuText} locale={locale} />
              </span>
            )}
          </div>
        </Card>
      );
      break;
    case 'history':
      content = (
        <Card title={t('act.traffic')} aside={<Segmented label={t('act.historyRange')} value={range} onChange={setRange} items={ranges} />}>
          {vm.history.error && vm.history.state !== 'ready' ? (
            <ErrorMessage error={vm.history.error} onRetry={vm.history.retry} />
          ) : vm.history.state === 'unavailable' ? (
            <div className="rp-chart-wait tall">
              <Empty>{t('act.noHistory')}</Empty>
            </div>
          ) : vm.history.state === 'loading' ? (
            <div className="rp-chart-wait tall">
              <DeferredLoading>{t('ui.loading')}</DeferredLoading>
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
                height={120 * scale}
                fill
                window={vm.trafficBounds}
              />
            </>
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
            <>
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
            </>
          ) : vm.memoryState.state === 'unavailable' ? (
            <Empty>{t('act.noHistory')}</Empty>
          ) : (
            <div className="rp-chart-wait">
              <DeferredLoading>{t('act.sampling')}</DeferredLoading>
            </div>
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
