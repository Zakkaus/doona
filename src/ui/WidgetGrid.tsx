import type {ReactNode} from 'react';
import './styles/widget-grid.css';

export type WidgetSize = 'small' | 'medium' | 'large';
// A wide widget, which only the dashboard lays out wider, takes the large cell everywhere else.
export const cellSize = <S extends string>(size: S) => (size === 'wide' ? 'large' : size) as Exclude<S, 'wide'> | 'large';
export function WidgetGrid({children}: {children: ReactNode}) {
  return <div className="rp-widget-grid">{children}</div>;
}
export function WidgetCell({size, id, module, children}: {size: WidgetSize; id: string; module: string; children: ReactNode}) {
  return (
    <div className="rp-widget-cell" data-size={size} data-widget-id={id} data-module={module}>
      {children}
    </div>
  );
}
