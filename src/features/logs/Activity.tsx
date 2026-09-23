import {useCallback, useMemo} from 'react';
import {LOCALE, useLang, useT} from '../../i18n';
import type {LogLevel, LogRecord} from '../../api/model';
import {usePalette, ChartCard, FactStrip, Heatmap, type ChartFact} from '../../ui/charts';
import {Button} from '../../ui/ui';
import AlertTriangle from '../../ui/icons/AlertTriangle';
import History from '../../ui/icons/History';
import Checkmark from '../../ui/icons/Checkmark';
import {levelHeatmap} from './heatmap';
import {logLevelLabels} from '../../api/selectors';

// When the feed was busy and with what: a row per level, a column per stretch of time. A row header sets the
// minimum level the list shows, which is what the level control already means.
export function LogActivity({
  records,
  offered,
  minimum,
  setMinimum
}: {
  records: LogRecord[];
  offered: LogLevel[];
  minimum: string;
  setMinimum: (level: string) => void;
}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const p = usePalette();
  const map = useMemo(() => levelHeatmap(records, offered, minimum as LogLevel | ''), [records, offered, minimum]);
  const clock = useMemo(() => new Intl.DateTimeFormat(locale, {hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}), [locale]);
  const span = useCallback((start: number) => `${clock.format(start)}–${clock.format(start + map.width)}`, [clock, map.width]);
  // Rebuilt only when the buckets change, and each bucket's span is formatted once for every level's row.
  const heat = useMemo(() => {
    const tones: Record<LogLevel, string> = {error: p.negative, warn: p.notice, info: p.info, debug: p.subtle, trace: p.muted};
    const spans = map.buckets.map(span);
    return {
      columns: map.buckets.map(start => clock.format(start)),
      rows: map.rows.map(row => {
        const level = t(logLevelLabels[row.level]);
        return {
          id: row.level,
          color: tones[row.level],
          // Every row header is the same button; the current minimum carries a check mark and changes nothing.
          label: (
            <Button
              quiet
              small
              className={row.level === minimum ? 'current' : undefined}
              label={t(row.level === minimum ? 'log.chart.current' : 'log.chart.minimum', {level})}
              onPress={() => setMinimum(row.level)}
            >
              {row.level === minimum && <Checkmark />}
              {level}
            </Button>
          ),
          counts: row.counts,
          titles: row.counts.map((n, i) => t('log.chart.cell', {time: spans[i], level, n}))
        };
      })
    };
  }, [map, span, clock, minimum, setMinimum, p, t]);
  if (!records.length) return null;
  const busiest = map.busiest;
  const facts: ChartFact[] = !busiest
    ? []
    : busiest.errors
      ? [
          {label: t('log.chart.errors'), value: t('log.chart.count', {n: busiest.errors}), icon: <AlertTriangle />, tone: 'negative'},
          {label: t('log.chart.peakErrors'), icon: <History />, tint: 'c1', value: t('log.chart.span', {time: span(busiest.start), n: busiest.count})}
        ]
      : [
          {label: t('log.chart.errors'), value: t('log.chart.count', {n: 0}), icon: <AlertTriangle />, tint: 'c5'},
          {label: t('log.chart.peak'), icon: <History />, tint: 'c1', value: t('log.chart.span', {time: span(busiest.start), n: busiest.count})}
        ];
  return (
    <div className="rp-chart-page">
      <FactStrip facts={facts} />
      <ChartCard title={t('log.chart.title')} note={t('log.chart.sample', {n: records.length})}>
        <Heatmap label={t('log.chart.title')} columns={heat.columns} rows={heat.rows} />
      </ChartCard>
    </div>
  );
}
