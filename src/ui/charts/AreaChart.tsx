import {useCallback, useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef, useState, type RefObject} from 'react';
import {useT} from '../../i18n';
import {localClockFormat, localMonthDayFormat, localTimeFormat} from '../../i18n/format';
import {useContentSize} from '../hooks';
import {usePalette} from './palette';
import {ChartTip, tipOverlay, useChartTip} from './tip';
import {clockLabels, linearPosition, nearestIndex, placeLabels, sampleTicks, seriesStats, valueAxis} from './layout';
import {pointerPosition, useSelection} from './interaction';
import {Curve, Gradient} from './AreaCurve';
import {seriesTipLines, stackedPlots, type Series} from './Charts';
// Use three to six round clock ticks, excluding marks whose labels would overhang the axis.
const tickSteps = [30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600, 43200, 86400].map(s => s * 1000);
function clockTicks(since: number, until: number): {ticks: number[]; step: number} {
  const span = until - since;
  const step = tickSteps.find(s => span / s <= 6) ?? tickSteps[tickSteps.length - 1];
  // Day and longer steps align to local midnight; shorter ones to the epoch, which lands on round minutes.
  const offset = step >= 86400000 ? new Date(until).getTimezoneOffset() * 60000 : 0;
  const first = Math.ceil((since - offset) / step) * step + offset;
  const ticks: number[] = [];
  for (let t = first; t <= until; t += step) if (t - since >= span * 0.04 && until - t >= span * 0.04) ticks.push(t);
  return {ticks, step};
}

// Measures the labels in the axis font. Labels that read the same in the same locale keep the sizes already measured,
// without touching the DOM or the state.
function useTickSizes(labels: string[], locale: string) {
  const [sizes, setSizes] = useState<Array<{width: number; height: number}>>([]);
  const measured = useRef('');
  useLayoutEffect(() => {
    const key = [locale, ...labels].join('\0');
    if (key === measured.current) return;
    measured.current = key;
    const el = document.createElement('span');
    el.className = 'rp-area-tick';
    // One caption line high, as the labels set in a card (dashboard.css), whatever the body's line height.
    Object.assign(el.style, {position: 'absolute', top: '-20000px', whiteSpace: 'pre', lineHeight: 'var(--rp-line-caption)'});
    document.body.appendChild(el);
    setSizes(
      labels.map(label => {
        el.textContent = label;
        const {width, height} = el.getBoundingClientRect();
        return {width, height};
      })
    );
    el.remove();
  }, [labels, locale]);
  return sizes;
}

// The plot's gaps, read from the spacing tokens (foundations.css) once its box is in the page: the value gutter's and
// stacked plots' (--rp-space-2), the time labels' gap under the plot and their caption line, and the least room between
// value labels, between round times, beside the plot's end times and between sample times.
const gapTokens = {
  value: '--rp-space-2',
  plot: '--rp-space-2',
  time: '--rp-space-1h',
  caption: '--rp-line-caption',
  label: '--rp-space-half',
  clock: '--rp-space-4',
  clockEnd: '--rp-space-6',
  sample: '--rp-space-2'
} as const;
type Gaps = Record<keyof typeof gapTokens, number>;
const noGaps = Object.fromEntries(Object.keys(gapTokens).map(key => [key, 0])) as Gaps;
function useGaps(ref: RefObject<HTMLElement | null>) {
  const [gaps, setGaps] = useState<Gaps | null>(null);
  useLayoutEffect(() => {
    const style = getComputedStyle(ref.current!);
    setGaps(Object.fromEntries(Object.entries(gapTokens).map(([key, name]) => [key, parseFloat(style.getPropertyValue(name))])) as Gaps);
  }, [ref]);
  return gaps;
}
const known = (value: number | null): value is number => value !== null;

export function AreaPlot({
  label,
  series,
  timestamps,
  fmt,
  locale,
  height,
  baseline = 'zero',
  window,
  fill,
  split = false,
  bare = false,
  inset = 2
}: {
  label: string;
  series: Series[];
  timestamps: number[];
  fmt: (value: number) => string;
  locale: string;
  // A bare plot's height, a sparkline's; any other takes the chart token's (--rp-chart-h, or --rp-chart-stacked-h for
  // stacked plots) times its card's height step.
  height?: number;
  // Under a legend, filling the card's height beyond the chart's (.rp-area-figure).
  fill?: boolean;
  window?: {since: number; until: number};
  baseline?: 'zero' | 'auto';
  // One plot per series, stacked over one time axis, each with a value axis of its own: for series that measure
  // different things in one unit, such as download and upload, whose scales can lie ten times apart. Series that share
  // a scale, such as two measures of one memory, share one plot.
  split?: boolean;
  // Without axis labels, the plot filling its box as a sparkline does: the panel's chart a sparkline high.
  bare?: boolean;
  // A bare plot's inline margin, as a sparkline's `inset`.
  inset?: number;
}) {
  const t = useT();
  const p = usePalette();
  const uid = useId();
  const [ref, size] = useContentSize<HTMLDivElement>(Math.round, 120);
  const gaps = useGaps(ref);
  const g = gaps ?? noGaps;
  const {tip, showAt, hide} = useChartTip();
  const [selectionPoint, setSelectionPoint] = useState<{index: number; y?: number} | null>(null);
  const selected = selectionPoint && selectionPoint.index < timestamps.length ? selectionPoint.index : null;
  const span = window ? window.until - window.since : timestamps.length ? timestamps[timestamps.length - 1] - timestamps[0] : 0;
  const since = window?.since;
  const until = window?.until;
  // The plot spans its samples, so the grid, the fill and the line start and end at one x; a window without samples
  // spans the window.
  const xDomain = useMemo<[number, number]>(
    () => (timestamps.length ? [Math.min(...timestamps), Math.max(...timestamps)] : since !== undefined && until !== undefined ? [since, until] : [0, 0]),
    [since, until, timestamps]
  );
  const marks = useMemo(() => (window ? clockTicks(xDomain[0], xDomain[1]) : undefined), [window, xDomain]);
  const withSeconds = marks ? marks.step < 60000 : span < 3 * 60 * 1000;
  // Use dates for day-scale windows and seconds for sub-minute tick spacing.
  const withDate = marks ? marks.step >= 86400000 : span > 36 * 60 * 60 * 1000;
  const clock = useMemo(() => (withDate ? localMonthDayFormat(locale) : localClockFormat(locale, withSeconds)), [locale, withSeconds, withDate]);
  const stacked = stackedPlots({split, bare, series});
  const panels = stacked ? series.length : 1;
  const panelOf = (index: number) => (panels > 1 ? index : 0);
  const axes = useMemo(
    () =>
      Array.from({length: panels}, (_, k) =>
        valueAxis(
          (panels > 1 ? [series[k]] : series).flatMap(s => s.values.filter(known)),
          baseline
        )
      ),
    [series, baseline, panels]
  );
  const stats = useMemo(() => series.map(s => seriesStats(s.values)), [series]);
  // Each plot's tick labels, three a plot: its bottom, middle and top.
  const yTexts = useMemo(() => axes.flatMap(axis => axis.ticks.map(fmt)), [axes, fmt]);
  const ySizes = useTickSizes(yTexts, locale);
  // The time axis labels round clock times between the plot's ends, or evenly spaced samples.
  const ticks = useMemo(() => {
    const last = timestamps.length - 1;
    return marks
      ? [xDomain[0], ...marks.ticks, xDomain[1]]
      : [...new Set((withSeconds ? [0, Math.round(last / 2), last] : [0, Math.round(last / 3), Math.round((2 * last) / 3), last]).map(i => timestamps[i]))];
  }, [marks, withSeconds, timestamps, xDomain]);
  const width = size?.width ?? 0;
  const h = size?.height ?? 0;
  // The plot starts at the box's start edge, the card's text inset, and its top at the box's top; the value axis labels
  // sit right-aligned in a gutter of the plot's own at its end, and the time labels under the last plot.
  const left = bare ? inset : 0;
  const top = bare ? 2 : 0;
  const bottom = h - (bare ? 2 : g.caption + g.time);
  // The value axis takes the room of its widest label and the gap before it, no more.
  const right = width - (bare ? inset : Math.ceil(Math.max(0, ...ySizes.map(size => size.width))) + g.value);
  // Stacked plots share the height equally, one --rp-space-2 apart.
  const band = (bottom - top - g.plot * (panels - 1)) / panels;
  const frames = axes.map((axis, k) => {
    const start = top + k * (band + g.plot);
    return {top: start, bottom: start + band, y: (value: number) => linearPosition(value, axis.domain, [start + band, start])};
  });
  const x = useCallback((value: number) => linearPosition(value, xDomain, [left, right]), [xDomain, left, right]);
  const xs = useMemo(() => timestamps.map(x), [timestamps, x]);
  const yOf = (index: number, value: number) => frames[panelOf(index)].y(value);
  const curves = series.map((s, index) => timestamps.map((_, i) => (s.values[i] == null ? null : {x: xs[i], y: yOf(index, s.values[i]!)})));
  const bounds = {x: left, y: top, width: right - left, height: bottom - top};
  const select = (index: number, pointerY?: number) => setSelectionPoint({index, y: pointerY});
  const clear = () => {
    setSelectionPoint(null);
    hide();
  };
  // Each series' peak and average over the range, said by the tip and the chart's description rather than written on
  // the card: the plot marks them with a dot and a dashed line.
  const statLines = (index: number) => {
    const stat = stats[index];
    const name = series[index].label;
    return stat && !bare
      ? [
          t('ui.valuePair', {label: t('widgets.peak', {series: name}), value: fmt(stat.peak)}),
          t('ui.valuePair', {label: t('widgets.average', {series: name}), value: fmt(stat.average)})
        ]
      : [];
  };
  // The tip's table: a row per series, its current value, peak and average under a header that carries the time.
  const tipTable = (at: number) => ({
    head: [localTimeFormat(locale).format(timestamps[at]), t('ui.current'), t('ui.peak'), t('ui.average')],
    rows: series.map((s, index) => {
      const value = s.values[at];
      const stat = stats[index];
      return {swatch: s.color, cells: [s.label, value == null ? '—' : fmt(value), stat ? fmt(stat.peak) : '—', stat ? fmt(stat.average) : '—']};
    })
  });
  // The tip over the page is placed from the plot's place in the viewport, so while it is open a scroll or a resize
  // draws the chart again to place it anew.
  const [, place] = useReducer((n: number) => n + 1, 0);
  const open = selected !== null;
  useEffect(() => {
    if (!open) return;
    globalThis.addEventListener('scroll', place, {capture: true, passive: true});
    globalThis.addEventListener('resize', place);
    return () => {
      globalThis.removeEventListener('scroll', place, {capture: true});
      globalThis.removeEventListener('resize', place);
    };
  }, [open]);
  useLayoutEffect(() => {
    if (selected === null || !series.some(s => s.values[selected] != null)) {
      hide();
      return;
    }
    showAt({
      x: xs[selected],
      y: selectionPoint?.y ?? (top + bottom) / 2,
      width,
      // The tip is drawn over the page, inside the viewport: a short plot's card would cut it off or cover its header.
      ...(ref.current ? tipOverlay(ref.current) : {bounds}),
      label: localTimeFormat(locale).format(timestamps[selected]),
      ...(bare ? {lines: seriesTipLines(series, selected, fmt, t)} : {lines: [], table: tipTable(selected)})
    });
  });
  const selection = useSelection(timestamps.length, select, clear);
  const tickLabels = useMemo(() => ticks.map(value => clock.format(value)), [ticks, clock]);
  const xSizes = useTickSizes(tickLabels, locale);
  const xTicks =
    xSizes.length !== ticks.length
      ? []
      : marks
        ? // Round times, never crowding each other, and the plot's first and last times only where they stand clear.
          clockLabels(
            ticks.map((value, index) => ({position: x(value), width: xSizes[index].width})),
            left,
            right,
            g.clock,
            g.clockEnd
          )
        : // The first label starts at the plot's start and the last ends at its end.
          sampleTicks(
            ticks.map(x),
            xSizes.map(size => size.width),
            g.sample,
            right
          );
  // Each plot labels its top, and its middle from zero or else its bottom, inside the plot's own height: two labels at
  // most, never overlapping, and a plot too short for two keeps its top.
  const yLabels =
    ySizes.length !== yTexts.length
      ? []
      : frames.flatMap((frame, k) =>
          placeLabels(
            (axes[k].ticks[0] === 0 ? [2, 1] : [2, 0]).map(i => ({index: k * 3 + i, position: frame.y(axes[k].ticks[i]), size: ySizes[k * 3 + i].height})),
            frame.top,
            frame.bottom,
            g.label
          )
        );
  const described = !bare && stats.some(Boolean);
  return (
    <div
      ref={ref}
      className="rp-area-plot"
      data-stacked={stacked || undefined}
      data-fill={fill || undefined}
      style={bare ? {height} : undefined}
      onPointerLeave={selection.onPointerLeave}
    >
      {timestamps.length > 0 && size && gaps && (
        <>
          <ChartTip tip={tip} />
          <svg
            className="rp-activity-surface"
            width={width}
            height={h}
            viewBox={`0 0 ${width} ${h}`}
            style={{display: 'block', overflow: 'visible'}}
            role="application"
            aria-label={label}
            aria-describedby={described ? uid + 'desc' : undefined}
            tabIndex={0}
            onFocus={selection.onFocus}
            onBlur={selection.onBlur}
            onKeyDown={selection.onKeyDown}
            onPointerMove={event => {
              const {x: px, y: py} = pointerPosition(event, event.currentTarget, {width, height: h});
              if (px < left || px > right || py < top || py > bottom) {
                clear();
                return;
              }
              const index = nearestIndex(xs, px);
              select(index, py);
            }}
          >
            {described && <desc id={uid + 'desc'}>{series.flatMap((_, index) => statLines(index)).join(t('ui.separator'))}</desc>}
            <g className="rp-area-grid">
              {frames.flatMap((frame, k) =>
                [...new Set(axes[k].ticks.map(frame.y))].map(value => (
                  <line key={`${k}-${value}`} x1={left} x2={right} y1={value} y2={value} stroke={p['hl-med']} strokeOpacity={0.6} fill="none" />
                ))
              )}
            </g>
            <defs>
              {series.map((s, k) => (
                <Gradient key={s.label} id={uid + k} color={s.color} />
              ))}
            </defs>
            {series.map((s, k) => (
              <Curve
                key={s.label}
                points={curves[k]}
                baseline={yOf(k, Math.max(0, axes[panelOf(k)].domain[0]))}
                color={s.color}
                id={uid + k}
                strokeWidth={bare ? 2 : 1.75}
              />
            ))}
            {!bare &&
              series.map((s, k) => {
                const stat = stats[k];
                if (!stat) return null;
                const average = yOf(k, stat.average);
                return (
                  <g key={s.label} className="rp-area-marks" pointerEvents="none">
                    <line x1={left} x2={right} y1={average} y2={average} stroke={s.color} strokeOpacity={0.55} strokeDasharray="4 4" />
                    <circle cx={xs[stat.at]} cy={yOf(k, stat.peak)} r={3} fill={s.color} stroke={p.surface} strokeWidth={1.5} />
                  </g>
                );
              })}
            {selected !== null &&
              frames.map(frame => (
                <path
                  key={frame.top}
                  d={`M${xs[selected]},${frame.top}L${xs[selected]},${frame.bottom}`}
                  stroke={p.subtle}
                  strokeDasharray="3 3"
                  fill="none"
                  pointerEvents="none"
                />
              ))}
            {!bare && (
              <>
                <g className="rp-area-x-ticks">
                  {xTicks.map(({index, position}) => (
                    <text key={index} x={position} y={bottom + g.time} className="rp-area-tick" textAnchor="middle">
                      <tspan x={position} dy="0.71em">
                        {tickLabels[index]}
                      </tspan>
                    </text>
                  ))}
                </g>
                <g className="rp-area-y-ticks">
                  {yLabels.map(({index, position}) => (
                    <text key={index} x={width} y={position} className="rp-area-tick" textAnchor="end">
                      <tspan x={width} dy="0.355em">
                        {yTexts[index]}
                      </tspan>
                    </text>
                  ))}
                </g>
              </>
            )}
            {selected !== null &&
              series.map((s, k) =>
                s.values[selected] == null ? null : (
                  <circle key={s.label} cx={xs[selected]} cy={yOf(k, s.values[selected]!)} r={4} fill={s.color} stroke={p.base} strokeWidth={2} />
                )
              )}
          </svg>
        </>
      )}
    </div>
  );
}
