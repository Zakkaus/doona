import {Fragment, type ReactNode} from 'react';
import {NodeName} from '../../ui/NodeName';
import {formatLatency} from '../../i18n/format';
import {formatList, useLang, useT, type Lang, type Translator} from '../../i18n';
import {Card, Empty, ErrorMessage, Loading, Segmented, Link} from '../../ui/ui';
import {latencyTone} from '../../ui/Tile';
import {usePalette, FactStrip, MarkerPlot, type ChartFact} from '../../ui/charts';
import AlertTriangle from '../../ui/icons/AlertTriangle';
import Clock from '../../ui/icons/Clock';
import SpeedFast from '../../ui/icons/SpeedFast';
import {latencyAverages, latencyMax, type LatencyBy, type LatencyMissing} from './latencyGroups';
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
      <Link appearance="link" href={hrefs.get(row.id) ?? nodeSetHref([row.id])}>
        <NodeName name={row.name} />
      </Link>
    </Fragment>
  ));
  if (rows.length <= named) return names;
  const more = (
    <Link appearance="link" href={nodeSetHref(rows.map(row => row.id))}>
      {t('nodes.latency.more', {n: rows.length - named})}
    </Link>
  );
  return t('nodes.latency.andMore', {names: '{names}', more: '{more}'})
    .split(/(\{names\}|\{more\})/)
    .map((part, index) => <Fragment key={index}>{part === '{names}' ? names : part === '{more}' ? more : part}</Fragment>);
}

// Every measured node on one axis, its latest latency beside the averages the backend reports, so a node that is slow
// now or slow on average stands out; failed and unmeasured nodes are listed, not left out.
export function NodeLatency() {
  const t = useT();
  const lang = useLang();
  const p = usePalette();
  const {nodes, by, setBy, view, hrefs} = useLatencyTab();
  if (nodes.error && !nodes.data) return <ErrorMessage error={nodes.error} onRetry={nodes.refetch} />;
  if (!nodes.data) return <Loading />;
  if (!nodes.data.length) return <Empty>{t('ui.empty')}</Empty>;
  const tone = {ok: p.positive, warn: p.notice, err: p.negative};
  const averages = latencyAverages(view);
  // One entry per node for the summary, whichever groups it sits in.
  const measured = [...new Map(view.flatMap(group => group.rows).map(row => [row.id, row])).values()].sort((a, b) => a.latest - b.latest);
  const down = new Set(view.flatMap(group => group.missing.filter(row => row.state === 'unavailable').map(row => row.id))).size;
  const facts: ChartFact[] = measured.length
    ? [
        {
          label: t('nodes.latency.lowest'),
          icon: <SpeedFast />,
          tint: 'c2',
          value: measured[0].name,
          nodeName: true,
          valueRole: 'name',
          caption: formatLatency(measured[0].latest, t)
        },
        {
          label: t('nodes.latency.highest'),
          icon: <Clock />,
          tint: 'c4',
          value: measured[measured.length - 1].name,
          nodeName: true,
          valueRole: 'name',
          caption: formatLatency(measured[measured.length - 1].latest, t)
        },
        {
          label: t('nodes.latency.unavailable'),
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
      <FactStrip facts={facts} />
      <Card
        title={t('ui.nodeLatency')}
        note={t('nodes.latency.sample', {n: nodes.data.length})}
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
        <MarkerPlot
          label={t('ui.nodeLatency')}
          max={latencyMax(view)}
          fmt={value => formatLatency(value, t)}
          showAll={n => t('nodes.latency.showAll', {n})}
          legend={[
            {kind: 'dot', label: t('nodes.latency.latest')},
            ...(averages.moving ? [{kind: 'diamond' as const, label: t('nodes.latency.moving')}] : []),
            ...(averages.avg10 ? [{kind: 'tick' as const, label: t('nodes.latency.avg10')}] : [])
          ]}
          groups={view.map(group => ({
            id: group.id,
            label: group.label ?? t(by === 'group' ? 'nodes.latency.noGroup' : 'nodes.latency.noProtocol'),
            rows: group.rows.map(row => {
              const details = [
                t('ui.valuePair', {label: t('nodes.latency.latest'), value: formatLatency(row.latest, t)}),
                ...(averages.moving ? [t('ui.valuePair', {label: t('nodes.latency.moving'), value: formatLatency(row.moving, t)})] : []),
                ...(averages.avg10 ? [t('ui.valuePair', {label: t('nodes.latency.avg10'), value: formatLatency(row.avg10, t)})] : [])
              ];
              return {
                id: row.id,
                label: row.name,
                nodeName: true,
                href: hrefs.get(row.id),
                values: {dot: row.latest, diamond: row.moving ?? undefined, tick: row.avg10 ?? undefined},
                text: formatLatency(row.latest, t),
                tone: tone[latencyTone(row.latest)],
                description: details.join(t('ui.separator')),
                details
              };
            }),
            notes: notes(group.missing)
          }))}
        />
      </Card>
    </div>
  );
}
