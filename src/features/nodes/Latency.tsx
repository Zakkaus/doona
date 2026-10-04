import {Fragment, type ReactNode} from 'react';
import {NodeName} from '../../ui/NodeName';
import {formatLatency} from '../../i18n/format';
import {formatList, useLang, useT, type Lang, type Translator} from '../../i18n';
import {Card, Empty, ErrorMessage, Segmented, SkeletonBody, Link} from '../../ui/ui';
import {FactStrip, MarkerPlot, type ChartFact} from '../../ui/charts';
import AlertTriangle from '../../ui/icons/AlertTriangle';
import Clock from '../../ui/icons/Clock';
import SpeedFast from '../../ui/icons/SpeedFast';
import {latencyAverages, latencyMax, latencyPlotRow, latencySummary, type LatencyBy, type LatencyMissing} from './latencyGroups';
import {nodeSetHref} from '../shared/link';
import {useLatencyTab} from './useLatencyTab';

const named = 6;

function nameSlot(message: string, names: ReactNode) {
  return message.split('{names}').map((part, index) => (
    <Fragment key={index}>
      {index > 0 && names}
      {part}
    </Fragment>
  ));
}

export function missingNames(rows: LatencyMissing[], lang: Lang, t: Translator, hrefs: Map<string, string>): ReactNode {
  const separator = formatList(lang, ['', '']);
  const names = rows.slice(0, named).map((row, index) => (
    <Fragment key={row.id}>
      {index > 0 && separator}
      <Link appearance="link" layout="inline" href={hrefs.get(row.id) ?? nodeSetHref([row.id])}>
        <NodeName name={row.name} />
      </Link>
    </Fragment>
  ));
  if (rows.length <= named) return names;
  const more = (
    <Link appearance="link" layout="inline" href={nodeSetHref(rows.map(row => row.id))}>
      {t('nodes.latency.more', {n: rows.length - named})}
    </Link>
  );
  return t('nodes.latency.andMore', {names: '{names}', more: '{more}'})
    .split(/(\{names\}|\{more\})/)
    .map((part, index) => <Fragment key={index}>{part === '{names}' ? names : part === '{more}' ? more : part}</Fragment>);
}

// The strip's facts while the first read is on its way: the measured branch's labels, each with its value's bar.
const loadingFacts = (t: Translator): ChartFact[] => [
  {label: t('nodes.latency.lowest'), icon: <SpeedFast />, tint: 'c2', value: '', caption: ' '},
  {label: t('nodes.latency.highest'), icon: <Clock />, tint: 'c4', value: '', caption: ' '},
  {label: t('ui.unavailable'), icon: <AlertTriangle />, tint: 'c5', value: ''}
];

// Every measured node's latest latency on one axis beside its average and the range they span, in the warning colour
// when it is well past its averages; failed and unmeasured nodes are listed, not left out.
export function NodeLatency() {
  const t = useT();
  const lang = useLang();
  const {nodes, by, setBy, view, hrefs} = useLatencyTab();
  if (nodes.error && !nodes.data) return <ErrorMessage error={nodes.error} onRetry={nodes.refetch} />;
  // The first read draws the strip's and the chart's Skeletons under their real labels and controls.
  const loading = !nodes.data;
  if (nodes.data && !nodes.data.length) return <Empty>{t('ui.empty')}</Empty>;
  const averages = latencyAverages(view);
  const {measured, down} = latencySummary(view);
  const first = measured[0];
  const last = measured.at(-1);
  const facts: ChartFact[] =
    first && last
      ? [
          {
            label: t('nodes.latency.lowest'),
            icon: <SpeedFast />,
            tint: 'c2',
            value: first.name,
            nodeName: true,
            valueRole: 'name',
            caption: formatLatency(first.latest, t)
          },
          {
            label: t('nodes.latency.highest'),
            icon: <Clock />,
            tint: 'c4',
            value: last.name,
            nodeName: true,
            valueRole: 'name',
            caption: formatLatency(last.latest, t)
          },
          {
            label: t('ui.unavailable'),
            value: t('nodes.latency.count', {n: down}),
            icon: <AlertTriangle />,
            tint: 'c5',
            tone: down ? 'negative' : undefined
          }
        ]
      : [];
  // Nodes without a latency are listed by state in a sentence each, naming the first few.
  const notes = (missing: LatencyMissing[]) => {
    const unavailable = missing.filter(row => row.state === 'unavailable');
    const unmeasured = missing.filter(row => row.state === 'unmeasured');
    return [
      ...(unavailable.length
        ? [nameSlot(t('nodes.latency.unavailableList', {n: unavailable.length, names: '{names}'}), missingNames(unavailable, lang, t, hrefs))]
        : []),
      ...(unmeasured.length
        ? [nameSlot(t('nodes.latency.unmeasuredList', {n: unmeasured.length, names: '{names}'}), missingNames(unmeasured, lang, t, hrefs))]
        : [])
    ];
  };
  return (
    <div className="rp-chart-page">
      <FactStrip facts={loading ? loadingFacts(t) : facts} loading={loading} />
      <Card
        title={t('ui.nodeLatency')}
        note={nodes.data && t('nodes.latency.sample', {n: nodes.data.length})}
        aside={
          <Segmented
            label={t('nodes.latency.by')}
            value={by}
            onChange={value => setBy(value as LatencyBy)}
            items={[
              ['group', t('nodes.latency.byGroup')],
              ['protocol', t('nodes.latency.byProtocol')]
            ]}
          />
        }
      >
        {loading ? (
          <SkeletonBody shape="rows" count={8} />
        ) : (
          <MarkerPlot
            label={t('ui.nodeLatency')}
            max={latencyMax(view)}
            fmt={value => formatLatency(value, t)}
            showAll={n => t('nodes.latency.showAll', {n})}
            legend={[
              {kind: 'dot', label: t('nodes.latency.latest')},
              ...(averages.moving || averages.avg10
                ? [
                    {kind: 'ring' as const, label: t('nodes.latency.average')},
                    {kind: 'line' as const, label: t('nodes.latency.range')},
                    {kind: 'dot' as const, label: t('nodes.latency.slower'), tone: 'notice' as const}
                  ]
                : [])
            ]}
            groups={view.map(group => ({
              id: group.id,
              label: group.label ?? t(by === 'group' ? 'nodes.latency.noGroup' : 'nodes.latency.noProtocol'),
              rows: group.rows.map(row => latencyPlotRow(row, t, hrefs.get(row.id))),
              notes: notes(group.missing)
            }))}
          />
        )}
      </Card>
    </div>
  );
}
