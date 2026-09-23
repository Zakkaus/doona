import type {ReactNode} from 'react';

// One entry of a chart legend: a swatch in the series colour (or a mark of its own), the name, and an optional value.
export function LegendItem({swatch, label, value}: {swatch: string | ReactNode; label: string; value?: string}) {
  return (
    <span className="it">
      {typeof swatch === 'string' ? <i className="sw" style={{background: swatch}} /> : swatch}
      {label}
      {value !== undefined && (
        <>
          {' '}
          <b>{value}</b>
        </>
      )}
    </span>
  );
}
