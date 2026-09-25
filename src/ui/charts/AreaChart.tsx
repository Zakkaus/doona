import {useId, useLayoutEffect, useMemo, useState} from 'react';
import {useT} from '../../i18n';
import {localTimeFormat} from '../../i18n/format';
import {useContentSize} from '../hooks';
import {usePalette} from './palette';
import {ChartTip, useChartTip} from './tip';
import {linearPosition, visibleTicks, nearestIndex} from './layout';
import {pointerPosition, useSelection} from './interaction';
import {Curve, Gradient} from './AreaCurve';
import type {Series} from './Charts';
const niceMax = (v: number) => {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const s = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(k => n <= k) ?? 10;
  return s * p;
};
const niceStep = (range: number) => {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(range, 1e-9))));
  const n = range / p;
  const s = n <= 1 ? 0.2 : n <= 2 ? 0.5 : n <= 5 ? 1 : 2;
  return s * p;
};
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

function useTickSizes(labels: string[]) {
  const [sizes, setSizes] = useState<Array<{width: number; height: number}>>([]);
  useLayoutEffect(() => {
    const el = document.createElement('span');
    Object.assign(el.style, {position: 'absolute', top: '-20000px', whiteSpace: 'pre', fontSize: '11px'});
    document.body.appendChild(el);
    const measure = () =>
      setSizes(
        labels.map(label => {
          el.textContent = label;
          const {width, height} = el.getBoundingClientRect();
          return {width, height};
        })
      );
    measure();
    el.remove();
  }, [labels]);
  return sizes;
}

export function AreaPlot({
  label,
  series,
  timestamps,
  fmt,
  locale,
  height = 150,
  baseline = 'zero',
  window,
  fill
}: {
  label: string;
  series: Series[];
  timestamps: number[];
  fmt: (value: number) => string;
  locale: string;
  height?: number;
  fill?: boolean;
  window?: {since: number; until: number};
  baseline?: 'zero' | 'auto';
}) {
  const t = useT();
  const p = usePalette();
  const uid = useId();
  const [ref, size] = useContentSize<HTMLDivElement>(Math.round, 120);
  const {tip, showAt, hide} = useChartTip();
  const [selectionPoint, setSelectionPoint] = useState<{index: number; y?: number} | null>(null);
  const selected = selectionPoint && selectionPoint.index < timestamps.length ? selectionPoint.index : null;
  const span = window ? window.until - window.since : timestamps.length ? timestamps[timestamps.length - 1] - timestamps[0] : 0;
  const since = window?.since;
  const until = window?.until;
  const marks = useMemo(() => (since !== undefined && until !== undefined ? clockTicks(since, until) : undefined), [since, until]);
  const withSeconds = marks ? marks.step < 60000 : span < 3 * 60 * 1000;
  // Use dates for day-scale windows and seconds for sub-minute tick spacing.
  const withDate = marks ? marks.step >= 86400000 : span > 36 * 60 * 60 * 1000;
  const clock = useMemo(
    () =>
      new Intl.DateTimeFormat(
        locale,
        withDate
          ? {month: 'numeric', day: 'numeric'}
          : withSeconds
            ? {hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'}
            : {hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}
      ),
    [locale, withSeconds, withDate]
  );
  const {yDomain, yTicks} = useMemo(() => {
    const values = series.flatMap(s => s.values.filter((v): v is number => v !== null));
    let lo = 0;
    let max = niceMax(Math.max(1, ...values) * 1.08);
    if (baseline === 'auto' && values.length) {
      const min = Math.min(...values);
      const top = Math.max(...values);
      const step = niceStep(Math.max(top - min, top * 0.02, 1));
      lo = Math.max(0, Math.floor(min / step) * step - step);
      max = Math.ceil(top / step) * step + step;
    }
    return {yDomain: [lo, max], yTicks: baseline === 'auto' ? [lo, (lo + max) / 2, max] : [max / 2, max]};
  }, [series, baseline]);
  const ticks = useMemo(() => {
    const last = timestamps.length - 1;
    return marks
      ? marks.ticks
      : [...new Set((withSeconds ? [0, Math.round(last / 2), last] : [0, Math.round(last / 3), Math.round((2 * last) / 3), last]).map(i => timestamps[i]))];
  }, [marks, withSeconds, timestamps]);
  const domain = useMemo<[number, number]>(
    () => (since !== undefined && until !== undefined ? [since, until] : [Math.min(...timestamps), Math.max(...timestamps)]),
    [since, until, timestamps]
  );
  const width = size?.width ?? 0;
  const h = size?.height ?? height;
  const bottom = h - 30;
  const right = width - 64;
  const xDomain: [number, number] = [Math.min(domain[0], ...timestamps), Math.max(domain[1], ...timestamps)];
  const x = (value: number) => linearPosition(value, xDomain, [20, right]);
  const y = (value: number) => linearPosition(value, yDomain as [number, number], [bottom, 8]);
  const bounds = {x: 20, y: 8, width: right - 20, height: bottom - 8};
  const select = (index: number, pointerY?: number) => setSelectionPoint({index, y: pointerY});
  const clear = () => {
    setSelectionPoint(null);
    hide();
  };
  useLayoutEffect(() => {
    if (selected === null) {
      hide();
      return;
    }
    if (!series.some(s => s.values[selected] != null)) {
      hide();
      return;
    }
    showAt({
      x: x(timestamps[selected]),
      y: selectionPoint?.y ?? (8 + bottom) / 2,
      width,
      bounds,
      label: localTimeFormat(locale).format(timestamps[selected]),
      lines: series
        .filter(s => s.values[selected] != null)
        .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
        .map(s => `${s.label}${t('ui.labelSeparator')}${fmt(s.values[selected]!)}`)
    });
  });
  const selection = useSelection(timestamps.length, select, clear);
  const tickLabels = useMemo(() => ticks.map(value => clock.format(value)), [ticks, clock]);
  const yLabels = useMemo(() => yTicks.map(fmt), [yTicks, fmt]);
  const xSizes = useTickSizes(tickLabels);
  const ySizes = useTickSizes(yLabels);
  const xTicks = marks
    ? visibleTicks(
        ticks.map(x),
        xSizes.map(size => size.width),
        0,
        width,
        16,
        true
      )
    : ticks.map((value, index) => ({index, position: x(value)}));
  const yTicksVisible = visibleTicks(
    yTicks.map(y),
    ySizes.map(size => size.height),
    0,
    h,
    5,
    false
  );
  const grid = [...new Set([...yTicksVisible.map(tick => y(yTicks[tick.index])), 8, bottom])];
  return (
    <div ref={ref} style={{height, width: '100%', flex: fill ? '1 1 auto' : undefined, position: 'relative'}} onPointerLeave={selection.onPointerLeave}>
      {timestamps.length > 0 && size && (
        <>
          <ChartTip tip={tip} />
          <svg
            className="rp-activity-surface"
            width={width}
            height={h}
            viewBox={`0 0 ${width} ${h}`}
            style={{display: 'block'}}
            role="application"
            aria-label={label}
            tabIndex={0}
            onFocus={selection.onFocus}
            onBlur={selection.onBlur}
            onKeyDown={selection.onKeyDown}
            onPointerMove={event => {
              const {x: px, y: py} = pointerPosition(event, event.currentTarget, {width, height: h});
              if (px < 20 || px > right || py < 8 || py > bottom) {
                clear();
                return;
              }
              const index = nearestIndex(timestamps.map(x), px);
              select(index, py);
            }}
          >
            <g className="rp-area-grid">
              {grid.map(value => (
                <line key={value} x1={20} x2={right} y1={value} y2={value} stroke={p['hl-med']} strokeDasharray="2 4" fill="none" />
              ))}
            </g>
            <defs>
              {series.map((s, k) => (
                <Gradient key={s.label} id={uid + k} color={s.color} />
              ))}
            </defs>
            {series.map((s, k) => (
              <Curve
                key={s.label}
                points={timestamps.map((stamp, i) => (s.values[i] == null ? null : {x: x(stamp), y: y(s.values[i]!)}))}
                baseline={y(Math.max(0, yDomain[0]))}
                color={s.color}
                id={uid + k}
                strokeWidth={2}
              />
            ))}
            {selected !== null && (
              <path
                d={`M${x(timestamps[selected])},8L${x(timestamps[selected])},${bottom}`}
                stroke={p.subtle}
                strokeDasharray="3 3"
                fill="none"
                pointerEvents="none"
              />
            )}
            <g>
              {xTicks.map(({index, position}) => (
                <text key={index} x={position} y={bottom + 8} fontSize={11} fill={p.subtle} textAnchor="middle">
                  <tspan x={position} dy="0.71em">
                    {tickLabels[index]}
                  </tspan>
                </text>
              ))}
            </g>
            <g className="rp-area-y-ticks">
              {yTicksVisible.map(({index, position}) => (
                <text key={index} x={right + 8} y={position} fontSize={11} fill={p.subtle} textAnchor="start">
                  <tspan x={right + 8} dy="0.355em">
                    {fmt(yTicks[index])}
                  </tspan>
                </text>
              ))}
            </g>
            {selected !== null &&
              series.map(s =>
                s.values[selected] == null ? null : (
                  <circle key={s.label} cx={x(timestamps[selected])} cy={y(s.values[selected]!)} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />
                )
              )}
          </svg>
        </>
      )}
    </div>
  );
}
