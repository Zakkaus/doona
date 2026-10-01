import {useContext, useRef, useState, useLayoutEffect, type CSSProperties, type ReactNode} from 'react';
import {TitlesShown} from './Card';
import './styles/widgets.css';

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
// The panel's one header row, collapsed or not: the backend's light (not when docked), the rates while collapsed, then the actions.
export function WidgetHeader({backend, actions, summary}: {backend?: ReactNode; actions: ReactNode; summary?: ReactNode}) {
  return (
    <div className="rp-widget-header">
      {backend && <div className="rp-widget-backend">{backend}</div>}
      {summary}
      <div className="rp-widget-actions">{actions}</div>
    </div>
  );
}
export function WidgetSpeed({up, down}: {up: string; down: string}) {
  return (
    <div className="rp-widget-speed">
      <span>{up}</span>
      <span>{down}</span>
    </div>
  );
}
// The panel's editor: the gallery, the canvas at the floating panel's `width`, and the inspector.
export function WidgetEditorLayout({
  width,
  gallery,
  canvas,
  inspector,
  galleryLabel,
  canvasLabel,
  inspectorLabel
}: {
  gallery: ReactNode;
  canvas: ReactNode;
  inspector: ReactNode;
  galleryLabel: string;
  canvasLabel: string;
  inspectorLabel: string;
  width: number;
}) {
  return (
    <div className="rp-widget-editor" style={{'--rp-panel-width': `${width}px`} as CSSProperties}>
      <section className="rp-widget-gallery">
        <h3 className="rp-h3">{galleryLabel}</h3>
        <WidgetPanel label={galleryLabel} kind="gallery">
          {gallery}
        </WidgetPanel>
      </section>
      <section className="rp-widget-canvas">
        <h3 className="rp-h3">{canvasLabel}</h3>
        <WidgetPanel label={canvasLabel} kind="canvas">
          {canvas}
        </WidgetPanel>
      </section>
      <section className="rp-widget-inspector" aria-label={inspectorLabel}>
        <h3 className="rp-h3">{inspectorLabel}</h3>
        {inspector}
      </section>
    </div>
  );
}
