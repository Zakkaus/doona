import type {ReactNode} from 'react';
import './styles/widget-grid.css';

export type WidgetSize = 'small' | 'medium' | 'large';
export function WidgetGrid({children}: {children: ReactNode}) {
  return <div className="rp-widget-grid">{children}</div>;
}
export function WidgetCell({size, id, children}: {size: WidgetSize; id: string; children: ReactNode}) {
  return (
    <div className="rp-widget-cell" data-size={size} data-widget-id={id}>
      {children}
    </div>
  );
}
