import {useMemo, useState} from 'react';
import {formatList, useLang, useT} from '../../i18n';
import {millis} from '../../api/u64';
import {useCapabilities, useGroups, useNodes} from '../../store';
import {Empty, ErrorMessage, Loading, Segmented} from '../../ui/ui';
import {latencyTone} from '../../ui/Tile';
import {usePalette} from '../../ui/Charts';
import {ChartCard, FactStrip, MarkerPlot, type ChartFact} from '../../ui/charts';
import AlertTriangle from '../../ui/icons/AlertTriangle';
import Clock from '../../ui/icons/Clock';
import SpeedFast from '../../ui/icons/SpeedFast';
import {latencyGroups, latencyMax, type LatencyBy, type LatencyMissing} from './latency';
import {offered} from '../../api/capabilities';

const named = 6;

// Every measured node on one axis, its latest latency beside its two averages, so a node that is slow now or
// slow on average stands out; failed and unmeasured nodes are listed, not left out.
export function NodeLatency() {
  const t = useT();
  const lang = useLang();
  const p = usePalette();
  const resources = useCapabilities().data?.resources;
  const nodes = useNodes(offered(resources, 'nodes', {whileLoading: true}));
  const groups = useGroups(offered(resources, 'groups', {whileLoading: false}));
  const [by, setBy] = useState<LatencyBy>('group');
  const view = useMemo(() => latencyGroups(nodes.data ?? [], groups.data, by), [nodes.data, groups.data, by]);
  if (nodes.error && !nodes.data) return <ErrorMessage error={nodes.error} onRetry={nodes.refetch} />;
  if (!nodes.data) return <Loading />;
  if (!nodes.data.length) return <Empty>{t('ui.empty')}</Empty>;
  const ms = (value: number) => t('ui.latency', {n: millis(value)});
  const tone = {ok: p.positive, warn: p.notice, err: p.negative};
  // One entry per node for the summary, whichever groups it sits in.
  const measured = [...new Map(view.flatMap(group => group.rows).map(row => [row.id, row])).values()].sort((a, b) => a.latest - b.latest);
  const down = new Set(view.flatMap(group => group.missing.filter(row => row.state === 'unavailable').map(row => row.id))).size;
  const facts: ChartFact[] = measured.length
    ? [
        {
          label: t('nodes.latency.lowest'),
          icon: <SpeedFast />,
          tint: 'c2',
          value: t('nodes.latency.named', {name: measured[0].name, ms: ms(measured[0].latest)})
        },
        {
          label: t('nodes.latency.highest'),
          icon: <Clock />,
          tint: 'c4',
          value: t('nodes.latency.named', {name: measured[measured.length - 1].name, ms: ms(measured[measured.length - 1].latest)})
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
  const dash = (value: number | null) => (value === null ? '—' : ms(value));
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
      <ChartCard title={t('nodes.latency.title')} note={t('nodes.latency.sample', {n: nodes.data.length})}>
        <div className="rp-row">
          <Segmented
            label={t('nodes.latency.by')}
            value={by}
            onChange={value => setBy(value as LatencyBy)}
            items={[
              ['group', t('nodes.latency.byGroup')],
              ['protocol', t('nodes.latency.byProtocol')]
            ]}
          />
        </div>
        <MarkerPlot
          label={t('nodes.latency.title')}
          max={latencyMax(view)}
          fmt={ms}
          showAll={n => t('nodes.latency.showAll', {n})}
          legend={[
            {kind: 'dot', label: t('nodes.latency.latest')},
            {kind: 'diamond', label: t('nodes.latency.moving')},
            {kind: 'tick', label: t('nodes.latency.avg10')}
          ]}
          groups={view.map(group => ({
            id: group.id,
            label: group.label ?? t(by === 'group' ? 'nodes.latency.noGroup' : 'nodes.latency.noProtocol'),
            rows: group.rows.map(row => ({
              id: row.id,
              label: row.name,
              values: {dot: row.latest, diamond: row.moving ?? undefined, tick: row.avg10 ?? undefined},
              text: ms(row.latest),
              tone: tone[latencyTone(row.latest)],
              description: t('nodes.latency.row', {latest: ms(row.latest), moving: dash(row.moving), avg10: dash(row.avg10)}),
              details: [
                t('ui.valuePair', {label: t('nodes.latency.latest'), value: ms(row.latest)}),
                t('ui.valuePair', {label: t('nodes.latency.moving'), value: dash(row.moving)}),
                t('ui.valuePair', {label: t('nodes.latency.avg10'), value: dash(row.avg10)})
              ]
            })),
            notes: notes(group.missing)
          }))}
        />
      </ChartCard>
    </div>
  );
}
