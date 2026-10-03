import {useT, useLang, LOCALE} from '../../i18n';
import {formatRate, formatUnit, formatDuration} from '../../i18n/format';
import {useCapabilities, useRuntime, useDatapath, useNoticeFeed, reopenEvents} from '../../store';
import {getApi} from '../../api';
import {interestingNotice} from '../../api/selectors';
import {engineStatus} from '../../features/shared/engineStatus';
import {NoticeList, noticeRows} from '../../features/activity/widgets';
import {Divider, ErrorMessage, Kv, Light, Link} from '../../ui/ui';
import {WidgetSpeed} from '../../ui/WidgetPanel';
import {usePalette} from '../../ui/charts';
import Download from '../../ui/icons/Download';
import Upload from '../../ui/icons/Upload';
import {href} from '../route';
import {contentLimit, canonicalForm, type Widget} from './layout';
import {RuntimeWidget, MemoryWidget} from './ContentRuntime';
import {RankingWidget, OutboundWidget, Connections, Dns} from './ContentShares';
import {ModeWidget, GroupWidget} from './ContentPolicies';
import {CurrentLatency, Latency, Sources, Groups} from './ContentNodes';
import {Reading} from './Reading';

// The rates widget's reading for a collapsed header: download before upload, in the chart's colours.
export function SpeedSummary({reserveWidth = false}: {reserveWidth?: boolean}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const p = usePalette();
  const capabilities = useCapabilities();
  const runtime = useRuntime(capabilities.data?.resources.runtime.available === true);
  const rates = runtime.data?.traffic.rates;
  return (
    <WidgetSpeed
      reserve={reserveWidth ? formatUnit(999.9, locale, 'unit.megabytePerSecond', 1) : undefined}
      rates={[
        {icon: <Download />, label: t('ui.download'), value: formatRate(rates?.download_bytes_per_second ?? null, locale), color: p.cat[0]},
        {icon: <Upload />, label: t('ui.upload'), value: formatRate(rates?.upload_bytes_per_second ?? null, locale), color: p.cat[3]}
      ]}
    />
  );
}
export function Contents({
  item,
  dashboard = false,
  docked = false,
  onChange
}: {
  item: Widget;
  dashboard?: boolean;
  docked?: boolean;
  onChange?: (item: Widget) => void;
}) {
  const form = canonicalForm(item, dashboard ? 'dashboard' : 'panel');
  item = {...item, form};
  switch (item.id) {
    case 'download':
    case 'upload':
    case 'history':
    case 'speed':
    case 'traffic':
    case 'connections':
    case 'cpu':
      return <RuntimeWidget item={item} form={form} />;
    case 'memory':
      return <MemoryWidget item={item} form={form} />;
    case 'ranking':
      return <RankingWidget item={item} />;
    case 'outbounds':
      return <OutboundWidget item={item} />;
    case 'global':
    case 'mode':
      return <ModeWidget targetOnly={item.id === 'global'} docked={docked} />;
    case 'latency':
      return <CurrentLatency item={item} dashboard={dashboard} onChange={onChange} />;
    case 'nodeLatency':
      return <Latency item={item} />;
    case 'sourceHealth':
      return <Sources item={item} />;
    case 'policyGroups':
      return <Groups item={item} />;
    case 'connectionOutbounds':
    case 'connectionNetworks':
      return <Connections item={item} />;
    case 'dnsAnswers':
      return <Dns item={item} />;
    case 'group':
      return <GroupWidget item={item} onChange={onChange} />;
    case 'status':
      return <StatusWidget item={item} />;
    case 'notices':
      return <NoticesWidget item={item} />;
    case 'divider':
      return <Divider orientation="horizontal" />;
    default:
      return null;
  }
}
function StatusWidget({item}: {item: Widget}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const runtime = useRuntime();
  const path = useDatapath(useCapabilities().data?.resources.datapath?.available === true);
  const status = engineStatus(runtime.data?.lifecycle.state, path.data?.state, '—', t);
  return (
    <Reading state={runtime}>
      <ErrorMessage error={path.error} onRetry={path.refetch} />
      <Light tone={status.tone}>{status.text}</Light>
      <Kv compact row={item.size !== 'small'} items={[[t('widgets.uptime'), formatDuration(runtime.data?.lifecycle.uptime_seconds ?? null, locale)]]} />
    </Reading>
  );
}
function NoticesWidget({item}: {item: Widget}) {
  const api = getApi();
  const t = useT();
  const feed = useNoticeFeed(interestingNotice);
  const records = feed.records;
  const rows = noticeRows(records, t).slice(0, contentLimit(item.size));
  return (
    <>
      <ErrorMessage error={feed.error} onRetry={() => reopenEvents(api)} />
      {!rows.length ? (
        <span className="rp-label">{t('widgets.noNotices')}</span>
      ) : (
        <>
          <NoticeList rows={rows} label={t('act.issues')} />
          <Link appearance="link" href={href('events')}>
            {t('widgets.noticeCount', {n: records.length})}
          </Link>
        </>
      )}
    </>
  );
}
