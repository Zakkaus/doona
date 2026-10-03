import {useContext, useRef, useState, useLayoutEffect, type CSSProperties, type KeyboardEvent, type ReactNode} from 'react';
import {VisuallyHidden, useLocale} from 'react-aria';
import {TitlesShown} from './Card';
import {ResizeHandle, resizeStep, useGesture} from './FloatingPanel';
import {clampPanelSize, minPanelSize} from './panelSize';
import './styles/widgets.css';
import './styles/floating-panel.css';

// A scrolling list of widgets. It fades at the edge while more lies beyond it, and keeps the selected row in view
// in the editor's canvas.
export function WidgetPanel({children, label, kind = 'panel'}: {children: ReactNode; label: string; kind?: 'panel' | 'gallery' | 'canvas'}) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const gutter = `${el.offsetWidth - el.clientWidth}px`;
      if (el.style.getPropertyValue('--rp-scrollbar-gutter') !== gutter) el.style.setProperty('--rp-scrollbar-gutter', gutter);
      setMore(el.scrollHeight > el.clientHeight + el.scrollTop + 1 || el.scrollWidth > el.clientWidth + Math.abs(el.scrollLeft) + 1);
    };
    let frame = 0;
    const schedule = () => {
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    const mutations = new MutationObserver(() => {
      schedule();
      const selected = el.querySelector<HTMLElement>('.rp-sortable-row[data-selected]');
      if (kind !== 'canvas' || !selected) return;
      const bounds = el.getBoundingClientRect();
      const box = selected.getBoundingClientRect();
      const padding = Number.parseFloat(getComputedStyle(el).scrollPaddingBlockStart) || 0;
      if (box.top < bounds.top + padding) el.scrollTop += box.top - bounds.top - padding;
      else if (box.bottom > bounds.bottom - padding) el.scrollTop += box.bottom - bounds.bottom + padding;
    });
    mutations.observe(el, {childList: true, subtree: true, attributes: true, attributeFilter: ['data-selected']});
    el.addEventListener('scroll', schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
      el.removeEventListener('scroll', schedule);
    };
  }, [kind]);
  return (
    <section className="rp-widget-panel" data-kind={kind} data-more={more || undefined}>
      <div
        ref={ref}
        className={`rp-widget-body rp-overlay-scroll${kind === 'gallery' ? ' rp-widget-gallery-list' : ''}`}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The named region supports keyboard scrolling.
        tabIndex={0}
        role="region"
        aria-label={label}
      >
        <div className="rp-widget-body-content">{children}</div>
      </div>
    </section>
  );
}
export function WidgetSection({label, hideLabel, children}: {label: string; hideLabel?: boolean; children: ReactNode}) {
  const titled = useContext(TitlesShown);
  return (
    <section className="rp-widget" aria-label={label}>
      {!hideLabel && titled && <h3 className="rp-widget-label rp-kv-label">{label}</h3>}
      {children}
    </section>
  );
}
// A labelled control on one line, label at the start and the control at the end, as a card's title and its aside.
export function WidgetRow({label, children}: {label: string; children: ReactNode}) {
  return (
    <div className="rp-widget-row">
      <span className="rp-kv-label">{label}</span>
      {children}
    </div>
  );
}
// The panel's one header row, collapsed or not: the backend's light (not when docked), the rates while collapsed, then the
// actions; without actions it is the summary a panel hidden at an edge leaves there.
export function WidgetHeader({backend, actions, summary}: {backend?: ReactNode; actions?: ReactNode; summary?: ReactNode}) {
  return (
    <div className="rp-widget-header">
      {backend && <div className="rp-widget-backend">{backend}</div>}
      {summary}
      {actions && <div className="rp-widget-actions">{actions}</div>}
    </div>
  );
}
// The live rates in a collapsed header, one per line: each direction's icon in its chart colour, then the rate; the
// direction's name is read out with it.
export type WidgetRate = {icon: ReactNode; label: string; value: string; color: string};
export function WidgetSpeed({rates, reserve}: {rates: WidgetRate[]; reserve?: string}) {
  return (
    <div className="rp-widget-speed" data-reserve={reserve}>
      {rates.map(rate => (
        <span key={rate.label}>
          <span className="rp-widget-speed-icon" style={{color: rate.color}}>
            {rate.icon}
          </span>
          <VisuallyHidden>{rate.label} </VisuallyHidden>
          <span className="rp-widget-speed-value">{rate.value}</span>
        </span>
      ))}
    </div>
  );
}
// The preview keeps the live panel's width; only its display scale changes with the available space. With
// `onPanelWidth`, the preview's inline end edge sets that width, within the panel's own limits.
export function WidgetEditorLayout({
  panelWidth,
  onPanelWidth,
  resizeLabel,
  header,
  gallery,
  canvas,
  inspector,
  galleryLabel,
  canvasLabel,
  inspectorLabel
}: {
  panelWidth: number;
  onPanelWidth?: (width: number) => void;
  resizeLabel?: string;
  header: ReactNode;
  gallery: ReactNode;
  canvas: ReactNode;
  inspector: ReactNode;
  galleryLabel: string;
  canvasLabel: string;
  inspectorLabel: string;
}) {
  const editor = useRef<HTMLDivElement>(null);
  const space = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [threeColumns, setThreeColumns] = useState(false);
  const rtl = useLocale().direction === 'rtl';
  const clampWidth = (next: number) => clampPanelSize({width: next, height: minPanelSize.height}).width;
  // The pointer moves in screen pixels and the preview is drawn at `scale`, so the edge follows the pointer; an arrow
  // key steps the panel's own width as the live panel's edge does.
  const resize = useGesture(
    () => ({width: panelWidth, scale}),
    (base, dx) => ({...base, width: clampWidth(base.width + (rtl ? -dx : dx) / base.scale)}),
    next => onPanelWidth?.(next.width)
  );
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const step = {ArrowLeft: -resizeStep, ArrowRight: resizeStep}[event.key];
    if (!step) return;
    event.preventDefault();
    onPanelWidth?.(clampWidth(panelWidth + (rtl ? -step : step)));
  };
  const width = resize.live?.width ?? panelWidth;
  useLayoutEffect(() => {
    const root = editor.current;
    const column = space.current;
    if (!root || !column) return;
    const measure = () => {
      const gap = Number.parseFloat(getComputedStyle(root.firstElementChild!).columnGap);
      setThreeColumns(root.clientWidth >= width + 320 + 240 + gap * 2);
      const style = getComputedStyle(column);
      const room = column.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
      setScale(Math.min(1, room / width));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(column);
    measure();
    return () => observer.disconnect();
  }, [width]);
  return (
    <div ref={editor} className="rp-widget-editor" style={{'--rp-panel-width': `${width}px`} as CSSProperties}>
      <div className="rp-widget-editor-grid" data-three-columns={threeColumns || undefined}>
        <section className="rp-widget-gallery">
          <h3 className="rp-h3">{galleryLabel}</h3>
          <WidgetPanel label={galleryLabel} kind="gallery">
            {gallery}
          </WidgetPanel>
        </section>
        <section className="rp-widget-canvas">
          <h3 className="rp-h3">{canvasLabel}</h3>
          <div ref={space} className="rp-widget-preview-space">
            <div className="rp-floating-panel rp-widget-preview" style={{zoom: scale, '--rp-preview-scale': scale} as CSSProperties}>
              <div className="rp-panel-head" inert>
                {header}
              </div>
              <WidgetPanel label={canvasLabel} kind="canvas">
                {canvas}
              </WidgetPanel>
              {onPanelWidth && <ResizeHandle edge={{inline: 'end'}} label={resizeLabel} {...resize.props} onKeyDown={onKeyDown} />}
            </div>
          </div>
        </section>
        <section className="rp-widget-inspector" aria-label={inspectorLabel}>
          <h3 className="rp-h3">{inspectorLabel}</h3>
          {inspector}
        </section>
      </div>
    </div>
  );
}
