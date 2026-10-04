import {useCallback, useMemo, type ReactNode} from 'react';
import {LOCALE, useLang, useT} from '../../i18n';
import {localClockFormat} from '../../i18n/format';
import type {LogLevel, LogRecord} from '../../api/model';
import {usePalette, FactStrip, Heatmap, type ChartFact} from '../../ui/charts';
import {Card, Button} from '../../ui/ui';
import AlertTriangle from '../../ui/icons/AlertTriangle';
import History from '../../ui/icons/History';
import Checkmark from '../../ui/icons/Checkmark';
import {levelHeatmap} from './heatmap';
import {logLevelLabels, logLevels} from '../../api/selectors';

// When the feed was busy and with what: a row per level, a column per stretch of time. A row header sets the
// minimum level the list shows, which is what the level control already means. While the stream opens (`waiting`),
// its space is held, so the list below does not move down when the first records arrive.
export function LogActivity({
  records,
  offered,
  minimum,
  setMinimum,
  waiting
}: {
  records: LogRecord[];
  offered: LogLevel[];
  minimum: string;
  setMinimum: (level: string) => void;
  waiting: boolean;
}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const p = usePalette();
  const map = useMemo(() => levelHeatmap(records, offered, minimum as LogLevel | ''), [records, offered, minimum]);
  const clock = useMemo(() => localClockFormat(locale), [locale]);
  const span = useCallback((start: number) => `${clock.format(start)}–${clock.format(start + map.width)}`, [clock, map.width]);
  // A row header per level: it changes with the minimum, not with every published batch.
  const heads = useMemo(() => {
    const entries = logLevels.map(level => {
      const text = t(logLevelLabels[level]);
      return [
        level,
        {
          text,
          // Every row header is the same button; the current minimum carries a check mark and changes nothing.
          label: (
            <Button
              quiet
              small
              className={level === minimum ? 'current' : undefined}
              label={t(level === minimum ? 'log.chart.current' : 'log.chart.minimum', {level: text})}
              onPress={() => setMinimum(level)}
            >
              {level === minimum && <Checkmark />}
              {text}
            </Button>
          )
        }
      ] as const;
    });
    return new Map(entries);
  }, [minimum, setMinimum, t]);
  // Rebuilt with the map, which is on every published batch; each bucket's span is formatted once for all the rows.
  const heat = useMemo(() => {
    const tones: Record<LogLevel, string> = {error: p.negative, warn: p.notice, info: p.info, debug: p.subtle, trace: p.muted};
    const spans = map.buckets.map(span);
    return {
      columns: map.buckets.map(start => clock.format(start)),
      rows: map.rows.map(row => {
        const {text: level, label} = heads.get(row.level)!;
        return {
          id: row.level,
          color: tones[row.level],
          label,
          counts: row.counts,
          titles: row.counts.map((n, i) => t('log.chart.cell', {time: spans[i], level, n}))
        };
      })
    };
  }, [map, span, clock, heads, p, t]);
  if (!records.length) return waiting ? <ActivityHold heads={heads} levels={map.rows.map(row => row.level)} time={clock.format(0)} /> : null;
  const busiest = map.busiest;
  const facts: ChartFact[] = !busiest
    ? []
    : busiest.errors
      ? [
          {label: t('log.chart.errors'), value: t('log.chart.count', {n: busiest.errors}), icon: <AlertTriangle />, tone: 'negative'},
          {label: t('log.chart.peakErrors'), icon: <History />, tint: 'c1', value: span(busiest.start), caption: t('log.chart.count', {n: busiest.count})}
        ]
      : [
          {label: t('log.chart.errors'), value: t('log.chart.count', {n: 0}), icon: <AlertTriangle />, tint: 'c5'},
          {label: t('log.chart.peak'), icon: <History />, tint: 'c1', value: span(busiest.start), caption: t('log.chart.count', {n: busiest.count})}
        ];
  return (
    <div className="rp-chart-page">
      <FactStrip facts={facts} />
      <Card title={t('log.chart.title')} note={t('log.chart.sample', {n: records.length})}>
        <Heatmap label={t('log.chart.title')} columns={heat.columns} rows={heat.rows} />
      </Card>
    </div>
  );
}

// The strip and the card laid out as loaded, hidden, each with a skeleton block over it: it takes the loaded chart's
// height exactly, with a row per level and the time marks below them.
function ActivityHold({heads, levels, time}: {heads: Map<LogLevel, {text: string; label: ReactNode}>; levels: LogLevel[]; time: string}) {
  const t = useT();
  const facts: ChartFact[] = [
    {label: t('log.chart.errors'), value: t('log.chart.count', {n: 0}), icon: <AlertTriangle />, tint: 'c5'},
    {label: t('log.chart.peak'), icon: <History />, tint: 'c1', value: `${time}–${time}`, caption: t('log.chart.count', {n: 0})}
  ];
  const rows = levels.map(level => ({id: level, color: 'transparent', label: heads.get(level)!.label, counts: [0], titles: ['']}));
  return (
    <div className="rp-chart-page" inert aria-hidden="true">
      <div className="rp-chart-hold">
        <FactStrip facts={facts} />
        <span className="rp-skeleton-text" />
      </div>
      <div className="rp-chart-hold">
        <Card title={t('log.chart.title')} note={t('log.chart.sample', {n: 0})}>
          <Heatmap label={t('log.chart.title')} columns={[time]} rows={rows} />
        </Card>
        <span className="rp-skeleton-text" />
      </div>
    </div>
  );
}
