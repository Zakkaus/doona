import type {ComponentProps} from 'react';
import {useT} from '../../i18n';
import {AreaChart, Legend, Spark} from './Charts';

// A subpixel time interval cannot show two distinct samples in a narrow plot; retain its latest reading.
export function compactSamples(timestamps: number[], minimumInterval = 1000): number[] {
  const indices: number[] = [];
  for (let i = timestamps.length - 1; i >= 0; i--) if (!indices.length || timestamps[indices.at(-1)!] - timestamps[i] >= minimumInterval) indices.push(i);
  return indices.reverse();
}

// A widget's area chart: the full chart at `normal`, otherwise the legend over one sparkline per series. It lives
// apart from the Activity page's charts so the startup bundle carries only the full chart.
// Each sparkline's tip lists every series at the hovered time, as the full chart's does.
export function WidgetAreaChart({size, ...props}: ComponentProps<typeof AreaChart> & {size: 'normal' | 'compact' | 'widget'}) {
  const t = useT();
  const legend = <Legend series={props.series} fmt={value => (value == null ? '—' : props.fmt(value))} />;
  if (size === 'normal')
    return (
      <>
        {legend}
        <AreaChart {...props} />
      </>
    );
  const indices = compactSamples(props.timestamps);
  const lines = (at: number) =>
    props.series
      .filter(s => s.values[indices[at]] != null)
      .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
      .map(s => t('ui.valuePair', {label: s.label, value: props.fmt(s.values[indices[at]]!)}));
  return (
    <figure className="rp-compact-chart" aria-label={props.label}>
      {legend}
      {props.series.map(series => (
        <Spark
          key={series.label}
          values={indices.map(index => series.values[index])}
          timestamps={indices.map(index => props.timestamps[index])}
          color={series.color}
          inset={2}
          height={size === 'widget' ? 64 : 32}
          fmt={props.fmt}
          locale={props.locale}
          lines={lines}
        />
      ))}
    </figure>
  );
}
