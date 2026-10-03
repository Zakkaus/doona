import type {ReactNode} from 'react';

// One entry of a chart legend: a swatch in the series colour (or a mark of its own), the name, and an optional value.
// `widest`, the widest text the value formats to, reserves its width so a live value never rewraps the legend.
export function LegendItem({swatch, label, value, widest}: {swatch: string | ReactNode; label: string; value?: string; widest?: string}) {
  return (
    <span className="it">
      {typeof swatch === 'string' ? <i className="sw" style={{background: swatch}} /> : swatch}
      {label}
      {value !== undefined && (
        <>
          {' '}
          <b data-widest={widest}>{value}</b>
        </>
      )}
    </span>
  );
}
