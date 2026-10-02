import {lazy, Suspense, useState, useSyncExternalStore, type ReactNode} from 'react';
import {useT} from '../../i18n';
import {Button, VisuallyHidden, phoneQuery, useMediaQuery} from '../../ui/ui';
import {LoadBoundary} from '../../ui/LoadBoundary';
import WidgetsIcon from '../../ui/icons/Widgets';
import {useModeDraft} from '../../features/shared/useModeDraft';
import {useDraftGuard} from '../draft';
import {BackendIndicator} from '../Backend';
import type {BackendView} from '../view';
import {patchLayout, useWidgetLayout} from './settings';
import {editorState} from './editorState';

// The shell's widget entry points stay small: the panel, drawer and editor load when first shown.
const PanelHost = lazy(() => import('./Widgets').then(module => ({default: module.PanelHost})));
const PhoneDrawer = lazy(() => import('./Widgets').then(module => ({default: module.PhoneDrawer})));
const WidgetEditor = lazy(() => import('./Editors').then(module => ({default: module.WidgetEditor})));
// The sidebar shows from this width, and with it the docking.
const sidebarQuery = '(min-width: 1024px)';
const later = (node: ReactNode) => (
  <LoadBoundary>
    <Suspense fallback={null}>{node}</Suspense>
  </LoadBoundary>
);

export function WidgetDraftGuard() {
  const [draft, setDraft] = useModeDraft();
  useDraftGuard(draft !== null, () => setDraft(null));
  return null;
}
// The sidebar keeps main's backend indicator at its foot; above phone width the panel opens over the content, and
// where the sidebar shows it docks in the indicator's place as the sidebar's last section, which stays at the foot
// while the links scroll above it. The sidebar renders, hidden, below its width too, so it hosts the panel there.
export function SidebarWidgets({route, backend, honk}: {route: string; backend: BackendView; honk: () => void}) {
  const t = useT();
  const sidebar = useMediaQuery(sidebarQuery);
  const phone = useMediaQuery(phoneQuery);
  const layout = useWidgetLayout();
  const [announcement, setAnnouncement] = useState({text: '', serial: 0});
  const shown = !phone && layout.visible;
  const docked = sidebar && !!layout.docked;
  const indicator = <BackendIndicator backend={backend} honk={honk} />;
  const panel = (
    <PanelHost
      route={route}
      backend={backend}
      honk={honk}
      dockable={sidebar}
      onDock={docked => {
        patchLayout({docked: docked || undefined});
        setAnnouncement(previous => ({text: t(docked ? 'widgets.docked' : 'widgets.undocked'), serial: previous.serial + 1}));
      }}
    />
  );
  return (
    <>
      {/* Dragging the floating panel's header opens this slot between the links and the foot. */}
      {shown && sidebar && !docked && (
        <div className="rp-dock-slot" aria-hidden="true">
          {t('widgets.dropToDock')}
        </div>
      )}
      {shown && docked ? (
        <LoadBoundary>
          <Suspense fallback={indicator}>{panel}</Suspense>
        </LoadBoundary>
      ) : (
        indicator
      )}
      {shown && !docked && later(panel)}
      {shown && sidebar && (
        <VisuallyHidden>
          <span role="status">
            <span key={announcement.serial}>{announcement.text}</span>
          </span>
        </VisuallyHidden>
      )}
    </>
  );
}
export function PhoneWidgets({route, backend}: {route: string; backend: BackendView}) {
  // Above phone width the button shows and hides the floating panel; on a phone it opens the sheet.
  const floating = !useMediaQuery(phoneQuery);
  const layout = useWidgetLayout();
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const editing = useSyncExternalStore(editorState.subscribe, editorState.snapshot);
  const [last, setLast] = useState({route, floating});
  if (last.route !== route || last.floating !== floating) {
    setLast({route, floating});
    setOpen(false);
  }
  if (open && !opened) setOpened(true);
  const t = useT();
  const shown = floating ? layout.visible : open;
  return (
    <>
      <Button
        quiet
        icon
        isSelected={shown}
        label={t(shown ? 'widgets.hide' : 'widgets.show')}
        onPress={() => (floating ? patchLayout({visible: !layout.visible}) : setOpen(!open))}
      >
        <WidgetsIcon />
      </Button>
      {!floating && opened && later(<PhoneDrawer open={open} onClose={() => setOpen(false)} backend={backend} />)}
      {editing && later(<WidgetEditor onClose={() => editorState.set(false)} />)}
    </>
  );
}
