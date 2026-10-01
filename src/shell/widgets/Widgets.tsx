import {useEffect, useLayoutEffect, useRef, type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {useT} from '../../i18n';
import {Button, DetailPanel, Divider, Light, MoreMenu} from '../../ui/ui';
import {FloatingPanel, ResizeHandle, useGesture} from '../../ui/FloatingPanel';
import {WidgetHeader, WidgetPanel} from '../../ui/WidgetPanel';
import {WidgetGrid, WidgetCell} from '../../ui/WidgetGrid';
import ChevronDown from '../../ui/icons/ChevronDown';
import Pin from '../../ui/icons/Pin';
import {parseHash} from '../route';
import {BackendIndicator} from '../Backend';
import type {BackendView} from '../view';
import {patchLayout, saveLayout, useWidgetLayout} from './settings';
import {WidgetContent} from './WidgetContent';
import {SpeedSummary} from './Contents';
import {instanceId} from './layout';
import {editorState} from './editorState';
import {arriveFromDock, rememberDock} from './dockMotion';

// The panel above phone width, over the content at the viewport's bottom corner, or, where the sidebar shows
// (`dockable`), docked as its last section; loaded once the panel is shown.
export function PanelHost({backend, honk, dockable, onDock}: {backend: BackendView; honk: () => void; dockable: boolean; onDock: (docked: boolean) => void}) {
  const layout = useWidgetLayout();
  const t = useT();
  const collapsed = layout.collapsed;
  const docked = dockable && !!layout.docked;
  useLayoutEffect(() => arriveFromDock(docked), [docked]);
  const dock = (next: boolean) => {
    rememberDock(!next);
    onDock(next);
  };
  // An unpinned floating panel collapses to its header when the reader moves to another page.
  useEffect(() => {
    if (layout.pinned || docked) return;
    let page = parseHash(location.hash).route;
    const follow = () => {
      const next = parseHash(location.hash).route;
      if (next !== page) patchLayout({collapsed: true});
      page = next;
    };
    addEventListener('hashchange', follow);
    return () => removeEventListener('hashchange', follow);
  }, [layout.pinned, docked]);
  // Docked, the divider above the section is its height's handle: from a header and one widget row up to the height
  // that still shows every link above it, or the section's default share when the links overflow anyway.
  const section = useRef<HTMLElement>(null);
  const dockResize = useGesture(
    () => {
      const el = section.current;
      const height = el?.getBoundingClientRect().height ?? 0;
      const body = el?.querySelector('.rp-widget-body');
      const first = el?.querySelector('.rp-widget-body-content > * > *');
      const side = el?.parentElement;
      const links = side?.querySelector('.rp-side-links');
      const min = height - (body?.clientHeight ?? 0) + (first?.getBoundingClientRect().height ?? 0);
      // A sidebar whose links overflow anyway still lets the section reach its default share.
      const room = links ? links.clientHeight - links.scrollHeight : 0;
      return {height, min, max: Math.max(min, height + room, (side?.clientHeight ?? 0) * 0.45)};
    },
    (base, _dx, dy) => ({...base, height: Math.min(base.max, Math.max(base.min, base.height - dy))}),
    next => patchLayout({dockHeight: Math.round(next.height)})
  );
  const dockHeight = dockResize.live?.height ?? layout.dockHeight;
  // Docked, the header keeps only the controls; the backend indicator with the engine and its version is the section's
  // foot, where it sits on main.
  const header = (
    <WidgetHeader
      backend={docked ? undefined : <BackendIndicator backend={backend} honk={honk} panel />}
      summary={collapsed ? <SpeedSummary /> : undefined}
      actions={
        <>
          {!docked && (
            <Button
              quiet
              icon
              isSelected={layout.pinned}
              label={t(layout.pinned ? 'widgets.unpin' : 'widgets.pin')}
              onPress={() => patchLayout({pinned: !layout.pinned})}
            >
              <Pin />
            </Button>
          )}
          <Button
            quiet
            icon
            className="rp-widget-collapse"
            expanded={!collapsed}
            label={t(collapsed ? 'widgets.expand' : 'widgets.collapse')}
            onPress={() => patchLayout({collapsed: !collapsed})}
          >
            <ChevronDown />
          </Button>
          <MoreMenu
            quiet
            label={t('widgets.panelOptions')}
            actions={[
              {id: 'edit', label: t('widgets.edit'), onAction: () => editorState.set(true)},
              ...(dockable ? [{id: 'dock', label: t(docked ? 'widgets.undock' : 'widgets.dock'), onAction: () => dock(!docked)}] : []),
              {id: 'hide', label: t('widgets.hide'), onAction: () => patchLayout({visible: false})}
            ]}
          />
        </>
      }
    />
  );
  if (docked)
    return (
      <section
        ref={section}
        className="rp-side-dock"
        aria-label={t('widgets.title')}
        data-sized={dockHeight && !collapsed ? true : undefined}
        style={dockHeight ? ({'--rp-dock-height': `${dockHeight}px`} as CSSProperties) : undefined}
      >
        <div className="rp-dock-edge">
          <Divider orientation="horizontal" />
          {!collapsed && <ResizeHandle edge={{block: 'start'}} label={t('widgets.resizePanel')} {...dockResize.props} />}
        </div>
        {header}
        {!collapsed && <SavedGrid />}
        <BackendIndicator backend={backend} honk={honk} />
      </section>
    );
  return createPortal(
    <FloatingPanel
      label={backend.text}
      resizeLabel={t('widgets.resizePanel')}
      moveLabel={t('widgets.movePanel')}
      movedText={t('widgets.panelMoved')}
      size={layout.size}
      offset={layout.offset}
      onResize={(size, offset) => patchLayout({size, offset})}
      onMove={offset => patchLayout({offset})}
      header={header}
      collapsed={collapsed}
      dockTarget={() => document.querySelector('.rp-dock-slot')}
      onDock={() => dock(true)}
    >
      {!collapsed && <SavedGrid />}
    </FloatingPanel>,
    document.body
  );
}
// The phone drawer, loaded on its first opening.
export function PhoneDrawer({open, onClose, backend}: {open: boolean; onClose: () => void; backend: BackendView}) {
  const t = useT();
  return (
    <DetailPanel
      open={open}
      title={backend.text}
      icon={<Light tone={backend.tone} small />}
      fit
      onClose={onClose}
      actions={<MoreMenu quiet label={t('widgets.panelOptions')} actions={[{id: 'edit', label: t('widgets.edit'), onAction: () => editorState.set(true)}]} />}
    >
      {open && <SavedGrid />}
    </DetailPanel>
  );
}
function SavedGrid() {
  const layout = useWidgetLayout();
  const t = useT();
  return (
    <WidgetPanel label={t('widgets.title')}>
      <WidgetGrid>
        {layout.items.map(item => (
          <WidgetCell key={instanceId(item)} id={instanceId(item)} size={item.size === 'wide' ? 'large' : item.size}>
            <WidgetContent
              item={item}
              onChange={next => saveLayout(previous => ({...previous, items: previous.items.map(old => (instanceId(old) === instanceId(next) ? next : old))}))}
            />
          </WidgetCell>
        ))}
      </WidgetGrid>
      {!layout.items.length && <span className="rp-label">{t('widgets.empty')}</span>}
    </WidgetPanel>
  );
}
