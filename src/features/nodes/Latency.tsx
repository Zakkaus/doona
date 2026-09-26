import {formatLatency} from '../../i18n/format';
import {formatList, useLang, useT} from '../../i18n';
import {Card, Empty, ErrorMessage, Loading, Segmented} from '../../ui/ui';
import {latencyTone} from '../../ui/Tile';
import {usePalette, FactStrip, MarkerPlot, type ChartFact} from '../../ui/charts';
import AlertTriangle from '../../ui/icons/AlertTriangle';
import Clock from '../../ui/icons/Clock';
import SpeedFast from '../../ui/icons/SpeedFast';
import {latencyAverages, latencyMax, type LatencyBy, type LatencyMissing} from './latencyGroups';
import {useLatencyTab} from './useLatencyTab';

const named = 6;

// Every measured node on one axis, its latest latency beside the averages the backend reports, so a node that is slow
// now or slow on average stands out; failed and unmeasured nodes are listed, not left out.
export function NodeLatency() {
  const t = useT();
  const lang = useLang();
  const p = usePalette();
  const {nodes, by, setBy, view} = useLatencyTab();
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
          caption: formatLatency(measured[0].latest, t)
        },
        {
          label: t('nodes.latency.highest'),
          icon: <Clock />,
          tint: 'c4',
          value: measured[measured.length - 1].name,
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
  const list = (rows: LatencyMissing[]) => {
    const names = formatList(
      lang,
      rows.slice(0, named).map(row => row.name)
    );
    return rows.length > named ? `${names} ${t('nodes.latency.andMore', {n: rows.length - named})}` : names;
  };
  const notes = (missing: LatencyMissing[]) => {
    const unavailable = missing.filter(row => row.state === 'unavailable');
    const unmeasured = missing.filter(row => row.state === 'unmeasured');
    return [
      ...(unavailable.length ? [t('nodes.latency.unavailableList', {n: unavailable.length, names: list(unavailable)})] : []),
      ...(unmeasured.length ? [t('nodes.latency.unmeasuredList', {n: unmeasured.length, names: list(unmeasured)})] : [])
    ];
  };
  return (
    <div className="rp-chart-page">
      <FactStrip facts={facts} />
      <Card
        title={t('nodes.latency.title')}
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
          label={t('nodes.latency.title')}
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
