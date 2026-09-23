import {useState, type ReactNode} from 'react';
import {Button} from '../Button';
import {useT} from '../../i18n';
import {useChartDescription} from './description';
import {ChartTip, useChartTip} from './tip';

export type MarkerKind = 'dot' | 'diamond' | 'tick';
// `description` is what the row says to a screen reader: every value it draws, in words.
// `details` are the hover tip's lines under the row's name.
export type MarkerRow = {
  id: string;
  label: string;
  values: Partial<Record<MarkerKind, number>>;
  text: string;
  description: string;
  details: string[];
  tone?: string;
};
// `notes` are the rows that have no value to draw, summed up in a sentence each (say, which nodes are unavailable).
export type MarkerGroup = {id: string; label: string; rows: MarkerRow[]; notes: string[]};

function Marker({kind, color}: {kind: MarkerKind; color?: string}) {
  return <i className={'rp-marker ' + kind} style={color ? {color} : undefined} aria-hidden="true" />;
}

// Rows of up to three values on one shared axis, each drawn with its own marker shape and named in the legend. A faint
// span joins a row's lowest and highest value, so three close values read as one tight cluster rather than a pile of
// shapes. Values past the axis end sit on the edge, and the row's number still says what they are.
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
  legend: Array<{kind: MarkerKind; label: string}>;
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
          <li key={item.kind}>
            <Marker kind={item.kind} />
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
          {(expanded.has(group.id) ? group.rows : group.rows.slice(0, limit)).map(row => {
            const values = Object.values(row.values).filter((value): value is number => value !== undefined);
            const low = at(Math.min(...values));
            const high = at(Math.max(...values));
            return (
              <div key={row.id} className="row" onPointerMove={event => showTip(event, [row.label, ...row.details])}>
                <span className="name">{row.label}</span>
                <div className="track" role="img" aria-label={row.label + t('ui.separator') + row.description}>
                  {ticks.map(tick => (
                    <i key={tick} className="grid" style={{insetInlineStart: `${at(tick)}%`}} />
                  ))}
                  {high > low && <i className="span" style={{insetInlineStart: `${low}%`, width: `${high - low}%`}} />}
                  {(['tick', 'diamond', 'dot'] as const).map(kind =>
                    row.values[kind] === undefined ? null : (
                      <span
                        key={kind}
                        className={'at ' + kind + (row.values[kind]! > max ? ' over' : '')}
                        style={{insetInlineStart: `${at(row.values[kind]!)}%`}}
                      >
                        <Marker kind={kind} color={kind === 'dot' ? row.tone : undefined} />
                      </span>
                    )
                  )}
                </div>
                <span className="value">{row.text}</span>
              </div>
            );
          })}
          {!expanded.has(group.id) && group.rows.length > limit && (
            <div className="row more">
              <Button quiet small onPress={() => setExpanded(current => new Set([...current, group.id]))}>
                {showAll(group.rows.length)}
              </Button>
            </div>
          )}
          {group.notes.map(note => (
            <p key={note} className="rp-note note">
              {note}
            </p>
          ))}
        </section>
      ))}
      <ChartTip tip={tipState} />
    </div>
  );
}
