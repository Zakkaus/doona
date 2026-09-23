import {useMemo} from 'react';
import {LOCALE, useLang, useT} from '../../i18n';
import type {LogLevel, LogRecord} from '../../api/model';
import {usePalette} from '../../ui/Charts';
import {Button} from '../../ui/ui';
import {ChartCard, Heatmap} from '../../ui/charts';
import {levelHeatmap} from './heatmap';
import {logLevelLabels} from './view';

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
  if (!records.length) return null;
  const tones: Record<LogLevel, string> = {error: p.negative, warn: p.notice, info: p.info, debug: p.subtle, trace: p.muted};
  const span = (start: number) => `${clock.format(start)}–${clock.format(start + map.width)}`;
  const busiest = map.busiest;
  const answer = !busiest
    ? ''
    : busiest.errors
      ? t('log.chart.answerErrors', {errors: busiest.errors, time: span(busiest.start), n: busiest.count})
      : t('log.chart.answerQuiet', {time: span(busiest.start), n: busiest.count});
  return (
    <ChartCard id="logs" question={t('log.chart.title')} answer={answer} sample={t('log.chart.sample', {n: records.length})}>
      <Heatmap
        label={t('log.chart.title')}
        columns={map.buckets.map(start => clock.format(start))}
        rows={map.rows.map(row => {
          const level = t(logLevelLabels[row.level]);
          return {
            id: row.level,
            color: tones[row.level],
            label:
              row.level === minimum ? (
                <span className="rp-label" title={t('log.chart.current', {level})}>
                  {level}
                </span>
              ) : (
                <Button quiet small label={t('log.chart.minimum', {level})} onPress={() => setMinimum(row.level)}>
                  {level}
                </Button>
              ),
            counts: row.counts,
            titles: row.counts.map((n, i) => t('log.chart.cell', {time: span(map.buckets[i]), level, n}))
          };
        })}
      />
    </ChartCard>
  );
}
