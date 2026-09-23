import {useState, type ReactNode} from 'react';
import {Button} from '../Button';

export type MarkerKind = 'dot' | 'diamond' | 'tick';
// `description` is what the row says to a screen reader: every value it draws, in words.
export type MarkerRow = {id: string; label: string; values: Partial<Record<MarkerKind, number>>; text: string; description: string; tone?: string};
export type MarkerGroup = {id: string; label: string; rows: MarkerRow[]; missing: Array<{id: string; label: string; text: string}>};

function Marker({kind, color}: {kind: MarkerKind; color?: string}) {
  return <i className={'rp-marker ' + kind} style={color ? {color} : undefined} aria-hidden="true" />;
}

// Rows of up to three values on one shared axis, each drawn with its own marker shape and named in the legend; rows
// without a value are listed under the axis with their state, so a failure is never a silent gap.
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
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const at = (value: number) => `${Math.min(100, (value / max) * 100)}%`;
  return (
    <div className="rp-markerplot" role="group" aria-label={label}>
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
            <span key={tick} style={{insetInlineStart: at(tick)}}>
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
            <div key={row.id} className="row">
              <span className="name">{row.label}</span>
              <div className="track" role="img" aria-label={`${row.label}: ${row.description}`}>
                {ticks.map(tick => (
                  <i key={tick} className="grid" style={{insetInlineStart: at(tick)}} />
                ))}
                {(['tick', 'diamond', 'dot'] as const).map(kind =>
                  row.values[kind] === undefined ? null : (
                    <span key={kind} className="at" style={{insetInlineStart: at(row.values[kind]!)}}>
                      <Marker kind={kind} color={kind === 'dot' ? row.tone : undefined} />
                    </span>
                  )
                )}
              </div>
              <span className="value">{row.text}</span>
            </div>
          ))}
          {!expanded.has(group.id) && group.rows.length > limit && (
            <Button quiet small onPress={() => setExpanded(current => new Set([...current, group.id]))}>
              {showAll(group.rows.length)}
            </Button>
          )}
          {group.missing.map(row => (
            <div key={row.id} className="row missing">
              <span className="name">{row.label}</span>
              <span className="rp-note">{row.text}</span>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
