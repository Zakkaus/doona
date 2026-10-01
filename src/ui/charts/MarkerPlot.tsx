import {useState, type ReactNode} from 'react';
import {NodeName} from '../NodeName';
import {Button, Link} from '../Button';
import {useT} from '../../i18n';
import {useChartDescription} from './description';
import {ChartTip, useChartTip} from './tip';

// `value` is the row's dot, coloured by `tone`. `description` is what the row says to a screen reader: every value it
// stands for, in words. `details` are the hover tip's lines under the row's name.
// With `href` the name opens what it names.
export type MarkerRow = {
  id: string;
  label: string;
  nodeName?: boolean;
  href?: string;
  value: number;
  text: string;
  description: string;
  details: string[];
  tone?: string;
};
// `notes` are the rows that have no value to draw, summed up in a sentence each (say, which nodes are unavailable).
export type MarkerGroup = {id: string; label: string; rows: MarkerRow[]; notes: ReactNode[]};
// Each legend entry names one dot colour.
export type MarkerLegend = {label: string; color?: string};

function Dot({color}: {color?: string}) {
  return <i className="rp-marker dot" style={color ? {color} : undefined} aria-hidden="true" />;
}

// Rows on one shared axis, a dot for each row's value whose colour carries its state.
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
  return (
    <div className="rp-markerplot rp-chart-hover" ref={tipRef} onPointerLeave={hideTip} role="group" aria-label={label} aria-describedby={describedBy}>
      <ul className="legend">
        {legend.map(item => (
          <li key={item.label}>
            <Dot color={item.color} />
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
          {(expanded.has(group.id) ? group.rows : group.rows.slice(0, limit)).map(row => (
            <div key={row.id} className="row" onPointerMove={event => showTip(event, [row.label, ...row.details], row.nodeName)}>
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
              <div className="track" role="img" aria-label={row.label + t('ui.separator') + row.description}>
                {ticks.map(tick => (
                  <i key={tick} className="grid" style={{insetInlineStart: `${at(tick)}%`}} />
                ))}
                <span className={'at' + (row.value > max ? ' over' : '')} style={{insetInlineStart: `${at(row.value)}%`}}>
                  <Dot color={row.tone} />
                </span>
              </div>
              <span className="value">{row.text}</span>
            </div>
          ))}
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
