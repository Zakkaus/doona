import {useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {flushSync} from 'react-dom';
import {NodeName} from '../NodeName';
import {Button, Link} from '../Button';
import {useT} from '../../i18n';
import {useChartDescription} from './description';
import {ChartTip, useChartTip} from './tip';
import {lineSpan, visibleRows} from './layout';

// `value` is the row's solid dot, coloured by `tone`; `average` its hollow ring and `range` the line joining them, both
// left out when null. `details` are the hover tip's lines under the row's name, and joined, what the row says to a
// screen reader; they are built only for the rows on screen. With `href` the name opens what it names.
export type MarkerRow = {
  id: string;
  label: string;
  nodeName?: boolean;
  href?: string;
  value: number;
  average: number | null;
  range: [number, number] | null;
  text: string;
  details: () => string[];
  tone?: string;
};
// `notes` are the rows that have no value to draw, summed up in a sentence each (say, which nodes are unavailable).
export type MarkerGroup = {id: string; label: string; rows: MarkerRow[]; notes: ReactNode[]};
export type MarkerLegend = {kind: 'dot' | 'ring' | 'line'; label: string; color?: string};

function Marker({kind, color}: {kind: MarkerLegend['kind']; color?: string}) {
  return <i className={'rp-marker ' + kind} style={color ? {color} : undefined} aria-hidden="true" />;
}

// An expanded group longer than this mounts only the rows near the viewport, so a group of thousands of node
// memberships does not build hundreds of thousands of elements.
const windowFrom = 40;
const overscan = 10;

// The rows of a long expanded group from the first to the last near the viewport, with spacers standing in for the
// rest so the page keeps its height. Rows just past the viewport are mounted too, so Tab reaches them and the focus
// scroll moves the window along; printing mounts every row.
function RowWindow({rows, render}: {rows: MarkerRow[]; render: (row: MarkerRow) => ReactNode}) {
  const box = useRef<HTMLDivElement>(null);
  const [span, setSpan] = useState({start: 0, end: Math.min(rows.length, windowFrom), height: 0});
  const [printing, setPrinting] = useState(false);
  useLayoutEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const element = box.current;
      if (!element) return;
      // Every row has one height; measure a mounted one, keeping the last height while none is.
      const height = element.querySelector<HTMLElement>(':scope > .row')?.getBoundingClientRect().height;
      setSpan(current => {
        const rowHeight = height || current.height;
        if (!rowHeight) return current;
        const next = {...visibleRows(rows.length, element.getBoundingClientRect().top, rowHeight, innerHeight, overscan), height: rowHeight};
        return current.start === next.start && current.end === next.end && current.height === next.height ? current : next;
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const print = () => flushSync(() => setPrinting(true));
    const printed = () => setPrinting(false);
    update();
    addEventListener('scroll', schedule, {capture: true, passive: true});
    addEventListener('resize', schedule);
    addEventListener('beforeprint', print);
    addEventListener('afterprint', printed);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('scroll', schedule, {capture: true});
      removeEventListener('resize', schedule);
      removeEventListener('beforeprint', print);
      removeEventListener('afterprint', printed);
    };
  }, [rows.length]);
  const start = printing ? 0 : Math.min(span.start, rows.length);
  const end = printing ? rows.length : Math.min(span.end, rows.length);
  return (
    <div ref={box}>
      {start > 0 && <div style={{height: start * span.height}} aria-hidden="true" />}
      {rows.slice(start, end).map(render)}
      {end < rows.length && <div style={{height: (rows.length - end) * span.height}} aria-hidden="true" />}
    </div>
  );
}

// Rows on one shared axis, each a solid dot for its value over a hollow ring for its average, joined by a thin line
// across its range, so the average reads as part of the row rather than another one.
// Values past the axis end sit on the edge, and the row's number still says what they are.
export function MarkerPlot({
  label,
  groups,
  legend,
  max,
  fmt,
  limit = 10,
  showAll
}: {
  label: string;
  groups: MarkerGroup[];
  legend: MarkerLegend[];
  max: number;
  fmt: (value: number) => string;
  // Rows shown per group before a "show all" button, so a hundred-node subscription does not fill the page.
  limit?: number;
  showAll: (n: number) => string;
}): ReactNode {
  const t = useT();
  const describedBy = useChartDescription();
  const {ref: tipRef, tip: tipState, show: showTip, hide: hideTip} = useChartTip();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const at = (value: number) => Math.min(100, (value / max) * 100);
  const renderRow = (row: MarkerRow) => {
    const line = row.range && lineSpan(row.range, max);
    return (
      <div key={row.id} className="row" onPointerMove={event => showTip(event, [row.label, ...row.details()], row.nodeName)}>
        <span className="name">
          {row.href ? (
            <Link appearance="link" href={row.href}>
              {row.nodeName ? <NodeName name={row.label} /> : row.label}
            </Link>
          ) : row.nodeName ? (
            <NodeName name={row.label} />
          ) : (
            row.label
          )}
        </span>
        <div className="track" role="img" aria-label={[row.label, ...row.details()].join(t('ui.separator'))}>
          {ticks.map(tick => (
            <i key={tick} className="grid" style={{insetInlineStart: `${at(tick)}%`}} />
          ))}
          {line && line.width > 0 && <i className="line" style={{insetInlineStart: `${line.start}%`, width: `${line.width}%`}} />}
          {row.average !== null && (
            <span className="at" style={{insetInlineStart: `${at(row.average)}%`}}>
              <Marker kind="ring" />
            </span>
          )}
          <span className={'at' + (row.value > max ? ' over' : '')} style={{insetInlineStart: `${at(row.value)}%`}}>
            <Marker kind="dot" color={row.tone} />
          </span>
        </div>
        <span className="value">{row.text}</span>
      </div>
    );
  };
  return (
    <div className="rp-markerplot rp-chart-hover" ref={tipRef} onPointerLeave={hideTip} role="group" aria-label={label} aria-describedby={describedBy}>
      <ul className="legend">
        {legend.map(item => (
          <li key={item.label}>
            <Marker kind={item.kind} color={item.color} />
            {item.label}
          </li>
        ))}
      </ul>
      <div className="axis" aria-hidden="true">
        <span />
        <div className="scale">
          {ticks.map(tick => (
            <span key={tick} style={{insetInlineStart: `${at(tick)}%`}}>
              {fmt(tick)}
            </span>
          ))}
        </div>
        <span />
      </div>
      {groups.map(group => (
        <section key={group.id} aria-label={group.label}>
          {groups.length > 1 && <h4 className="rp-label">{group.label}</h4>}
          {!expanded.has(group.id) ? (
            group.rows.slice(0, limit).map(renderRow)
          ) : group.rows.length > windowFrom ? (
            <RowWindow rows={group.rows} render={renderRow} />
          ) : (
            group.rows.map(renderRow)
          )}
          {!expanded.has(group.id) && group.rows.length > limit && (
            <div className="row more">
              <Button quiet small onPress={() => setExpanded(current => new Set([...current, group.id]))}>
                {showAll(group.rows.length)}
              </Button>
            </div>
          )}
          {group.notes.map((note, index) => (
            <p key={index} className="rp-note note">
              {note}
            </p>
          ))}
        </section>
      ))}
      <ChartTip tip={tipState} />
    </div>
  );
}
