import {useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction} from 'react';
import {useT} from '../../i18n';
import {Button, ConfirmDialog, ModalDialog, PopoverDialog, VisuallyHidden, closeToast, toast} from '../../ui/ui';
import {useDraftGuard} from '../draft';
import {saveDashboard} from './dashboardSettings';
import {SortableCanvas, reorderKeys} from '../../ui/SortableCanvas';
import {WidgetEditorLayout} from '../../ui/WidgetPanel';
import {WidgetContent} from './WidgetContent';
import {readLayout, saveLayout} from './settings';
import Settings from '../../ui/icons/Settings';
import Delete from '../../ui/icons/Delete';
import {ModuleGallery, ModuleInspector} from './ModuleControls';
import {dashboardDefaults, dashboardItems, mainCard, mapWidgets, tileOf, type DashboardLayout} from './dashboardLayout';
import {placeWidget, removeWidget, stepWidget} from './dashboardEdit';
import {sizeAxes, withPreset, type Preset, type SizeAxis} from './dashboardSizing';
import {DashboardResize, type ResizeAxis} from '../../ui/DashboardResize';
import {instanceId, defaults, registry, restoredPanel, changesPanel, type Widget, type WidgetId} from './layout';
import {addInstance, moveWidget} from './instances';
import {defaultPanelHeight, minPanelSize} from '../../ui/panelSize';
import type {BackendView} from '../view';
import {PanelHeader} from './Widgets';

type Draft = {draft: DashboardLayout; setDraft: Dispatch<SetStateAction<DashboardLayout | null>>};
const replace = (draft: DashboardLayout, item: Widget) => mapWidgets(draft, old => (instanceId(old) === instanceId(item) ? item : old));

// The page in edit mode: the same sections and cells, as sortable canvases. Every tool sits in a card's corner or in
// a dialog, so nothing enters the page's flow.
export function DashboardEditor({draft, setDraft, render}: Draft & {render: (item: Widget) => ReactNode}) {
  const t = useT();
  const [announcement, setAnnouncement] = useState({text: '', serial: 0});
  const items = dashboardItems(draft);
  const announce = (text: string) => setAnnouncement(previous => ({text, serial: previous.serial + 1}));
  // A removal's toast announces it and offers Undo while the editor is open; leaving the editor closes it, and so does
  // a change after which the card could not come back, such as another card of its module taking its free place.
  const undos = useRef<Array<{key: string; restorable: (layout: DashboardLayout) => boolean}>>([]);
  useEffect(() => () => undos.current.forEach(undo => closeToast(undo.key)), []);
  useEffect(() => {
    undos.current = undos.current.filter(undo => {
      if (undo.restorable(draft)) return true;
      closeToast(undo.key);
      return false;
    });
  }, [draft]);
  // The next card slides under a pointer that just pressed Remove, so card tools stay hidden until the pointer moves or
  // a key is pressed; focus goes to that next card, or the one before it when the last was removed.
  // A layout change under a still pointer fires a pointermove at the same spot, so movement is a change of position
  // from the last one seen; WebKit reports no movementX or movementY on pointer events.
  const [rearm, setRearm] = useState<{focus?: string} | null>(null);
  const pointer = useRef({x: Number.NaN, y: Number.NaN});
  useEffect(() => {
    const track = (event: PointerEvent) => void (pointer.current = {x: event.clientX, y: event.clientY});
    document.addEventListener('pointerdown', track, true);
    document.addEventListener('pointermove', track, true);
    return () => {
      document.removeEventListener('pointerdown', track, true);
      document.removeEventListener('pointermove', track, true);
    };
  }, []);
  useEffect(() => {
    if (!rearm) return;
    const {x, y} = pointer.current;
    const clear = (event: Event) => {
      if (event instanceof PointerEvent && event.clientX === x && event.clientY === y) return;
      setRearm(null);
    };
    document.addEventListener('pointermove', clear, true);
    document.addEventListener('keydown', clear, true);
    return () => {
      document.removeEventListener('pointermove', clear, true);
      document.removeEventListener('keydown', clear, true);
    };
  }, [rearm]);
  const remove = (item: Widget) => {
    const {layout, restore, restorable} = removeWidget(draft, instanceId(item));
    const at = items.findIndex(other => instanceId(other) === instanceId(item));
    const near = items[at + 1] ?? items[at - 1];
    setRearm({focus: near && instanceId(near)});
    setDraft(layout);
    // Each removal is its own toast, so removing two cards of one module keeps both Undo buttons.
    const key = toast('neutral', t('widgets.removed', {name: t(registry[item.id].label)}), {
      id: `removed:${instanceId(item)}`,
      action: {label: t('widgets.undo'), onAction: () => setDraft(current => current && restore(current)), closeOnAction: true}
    });
    undos.current.push({key, restorable});
  };
  return (
    <>
      {draft.sections.map(section => (
        <SortableCanvas
          key={section.id}
          label={t('widgets.order')}
          profile={section.id}
          items={section.items.map(item => ({...tileOf(item), item}))}
          textValue={({item}) => t(registry[item.id].label)}
          dragLabel={({item}) => t('widgets.drag', {name: t(registry[item.id].label)})}
          gapLabel={space => t('dashboard.remaining', {space})}
          refusal={t('dashboard.noRoom')}
          rearm={rearm}
          resize={({item}) => {
            const axes = sizeAxes(item, mainCard(item), t);
            const handle = (axis: SizeAxis | undefined, label: string): ResizeAxis | undefined =>
              axis && {
                label,
                value: axis.value,
                options: axis.options,
                onChange: option => {
                  setDraft(replace(draft, axis.set(option.value)));
                  announce(`${axis.label}: ${option.label}`);
                }
              };
            return <DashboardResize width={handle(axes.width, t('dashboard.resizeWidth'))!} height={handle(axes.height, t('dashboard.resizeHeight'))} />;
          }}
          onPlace={(id, place) => {
            setDraft(placeWidget(draft, id, {section: section.id, ...place}));
            announce(t('widgets.reordered'));
          }}
          tools={({item}) => (
            <>
              <PopoverDialog
                title={t(registry[item.id].label)}
                placement="bottom end"
                trigger={
                  <Button quiet icon label={t('widgets.inspector')}>
                    <Settings />
                  </Button>
                }
              >
                {() => (
                  <div className="rp-module-inspector">
                    <ModuleInspector
                      active={item}
                      items={items}
                      surface="dashboard"
                      update={next => setDraft(replace(draft, next))}
                      move={delta => {
                        setDraft(stepWidget(draft, instanceId(item), delta));
                        announce(t('widgets.reordered'));
                      }}
                      remove={() => remove(item)}
                    />
                  </div>
                )}
              </PopoverDialog>
              <Button quiet icon label={t('widgets.removeName', {name: t(registry[item.id].label)})} onPress={() => remove(item)}>
                <Delete />
              </Button>
            </>
          )}
        >
          {({item}) => render(item)}
        </SortableCanvas>
      ))}
      <VisuallyHidden>
        <span role="status">
          <span key={announcement.serial}>{announcement.text}</span>
        </span>
      </VisuallyHidden>
    </>
  );
}
// New cards join the extensions section, whose grid takes any kind and size, at the preset the gallery chose.
function extend(draft: DashboardLayout, id: WidgetId, preset?: Preset): DashboardLayout {
  const added = addInstance(dashboardItems(draft), id);
  if (!added) return draft;
  const item = preset ? withPreset(added, preset) : added;
  return {...draft, sections: draft.sections.map(section => (section.id === 'extensions' ? {...section, items: [...section.items, item]} : section))};
}
// The editing page's actions own the draft's lifecycle: the unsaved-draft guard, Cancel's confirmation, Reset and Done.
export function DashboardActions({draft, saved, setDraft, onClose}: Draft & {saved: DashboardLayout; onClose: () => void}) {
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  useDraftGuard(dirty, onClose);
  return (
    <>
      <ModalDialog
        title={t('widgets.gallery')}
        size="wide"
        scrollBody
        trigger={<Button>{t('widgets.gallery')}</Button>}
        footer={close => <Button onPress={close}>{t('ui.close')}</Button>}
      >
        <div className="rp-widget-gallery-grid">
          <ModuleGallery items={dashboardItems(draft)} add={(id, preset) => setDraft(extend(draft, id, preset))} surface="dashboard" />
        </div>
      </ModalDialog>
      <Button onPress={() => setDraft(dashboardDefaults())}>{t('widgets.reset')}</Button>
      <Button onPress={() => (dirty ? setConfirm(true) : onClose())}>{t('ui.cancel')}</Button>
      <Button
        accent
        onPress={() => {
          saveDashboard(draft);
          onClose();
        }}
      >
        {t('ui.done')}
      </Button>
      <ConfirmDialog
        title={t('config.discardTitle')}
        isOpen={confirm}
        onCancel={() => setConfirm(false)}
        confirmLabel={t('config.discard')}
        onConfirm={onClose}
      >
        <p>{t('widgets.discardHelp')}</p>
      </ConfirmDialog>
    </>
  );
}
// The panel's editor: a dialog with the gallery, the panel's canvas and the selected widget's inspector.
export function WidgetEditor({onClose, backend}: {onClose: () => void; backend: BackendView}) {
  const t = useT();
  const [layout] = useState(readLayout);
  const original = layout.items;
  const [items, setItems] = useState(original);
  // Restoring the defaults also returns the panel to its corner and default size once saved.
  const [restored, setRestored] = useState(false);
  // The preview is the floating panel at its own width, which its edge changes. A docked panel's width is the sidebar's,
  // so its preview opens at that width and its edge sets the width the panel floats at, which the preview then shows.
  const [dockWidth] = useState(() => (layout.docked ? document.querySelector<HTMLElement>('.rp-side-dock')?.offsetWidth : undefined));
  const savedWidth = layout.size?.width ?? minPanelSize.width;
  const [width, setWidth] = useState(savedWidth);
  const [resized, setResized] = useState(false);
  const widthChanged = width !== (restored ? minPanelSize.width : savedWidth);
  // Nothing is selected until the reader picks a widget, so the preview opens without a selection frame.
  const [selected, select] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [announcement, setAnnouncement] = useState({text: '', serial: 0});
  const announce = (text: string) => setAnnouncement(previous => ({text, serial: previous.serial + 1}));
  // Saving a reset also moves the panel, so a reset counts as a change whenever the panel is not already at its default.
  const panelMoves = restored && changesPanel(readLayout());
  const dirty = useMemo(() => JSON.stringify(original) !== JSON.stringify(items), [original, items]) || panelMoves || widthChanged;
  useDraftGuard(dirty, onClose);
  const cancel = () => (dirty ? setConfirm(true) : onClose());
  const update = (item: Widget) => setItems(previous => previous.map(old => (instanceId(old) === instanceId(item) ? item : old)));
  const add = (id: WidgetId) => {
    const item = addInstance(items, id);
    if (!item) return;
    setItems([...items, item]);
    select(instanceId(item));
    announce(t('widgets.addedName', {name: t(registry[id].label)}));
  };
  const active = items.find(item => instanceId(item) === selected);
  const remove = (item: Widget) => {
    const id = instanceId(item);
    setItems(previous => previous.filter(item => instanceId(item) !== id));
    select(null);
    announce(t('widgets.removed', {name: t(registry[item.id].label)}));
  };
  return (
    <>
      <ModalDialog
        title={t('widgets.edit')}
        size="wide"
        scrollBody
        isOpen
        onOpenChange={open => {
          if (!open) cancel();
        }}
        footer={() => (
          <>
            <Button
              onPress={() => {
                setItems(defaults().items);
                setRestored(true);
                setWidth(minPanelSize.width);
                select(null);
              }}
            >
              {t('widgets.reset')}
            </Button>
            <Button onPress={cancel}>{t('ui.cancel')}</Button>
            <Button
              accent
              onPress={() => {
                saveLayout(previous => ({
                  ...previous,
                  version: 3,
                  items,
                  ...(restored && restoredPanel),
                  ...(widthChanged && {size: {width, height: (restored ? undefined : previous.size?.height) ?? defaultPanelHeight}})
                }));
                onClose();
              }}
            >
              {t('settings.save')}
            </Button>
          </>
        )}
      >
        <WidgetEditorLayout
          panelWidth={(restored || resized ? undefined : dockWidth) ?? width}
          onPanelWidth={next => {
            setResized(true);
            setWidth(next);
          }}
          resizeLabel={t('widgets.resizePreview')}
          header={<PanelHeader backend={backend} preview />}
          galleryLabel={t('widgets.gallery')}
          canvasLabel={t('widgets.canvas')}
          inspectorLabel={active ? t(registry[active.id].label) : t('widgets.inspector')}
          gallery={<ModuleGallery items={items} add={add} />}
          canvas={
            <SortableCanvas
              label={t('widgets.order')}
              items={items.map(item => ({item, module: item.id, id: instanceId(item), size: item.size}))}
              textValue={({item}) => t(registry[item.id].label)}
              selectionMode="single"
              selectedKeys={selected ? new Set([selected]) : new Set()}
              onSelectionChange={keys => {
                if (keys !== 'all') select(String([...keys][0]));
              }}
              dragLabel={({item}) => t('widgets.drag', {name: t(registry[item.id].label)})}
              onPlace={(id, {target, after}) => {
                if (!target) return;
                setItems(previous => {
                  const ids = reorderKeys(previous.map(instanceId), new Set([id]), target, after ? 'after' : 'before');
                  return ids.flatMap(key => previous.find(item => instanceId(item) === key) ?? []);
                });
                announce(t('widgets.reordered'));
              }}
            >
              {({item}) => <WidgetContent item={item} preview />}
            </SortableCanvas>
          }
          inspector={
            <ModuleInspector
              active={active}
              items={items}
              sizes={active ? registry[active.id].sizes : []}
              surface="panel"
              update={update}
              move={delta => {
                if (active) setItems(moveWidget(items, instanceId(active), delta));
                announce(t('widgets.reordered'));
              }}
              remove={() => {
                if (active) remove(active);
              }}
            />
          }
        />
        <VisuallyHidden>
          <span role="status">
            <span key={announcement.serial}>{announcement.text}</span>
          </span>
        </VisuallyHidden>
      </ModalDialog>
      <ConfirmDialog
        title={t('config.discardTitle')}
        isOpen={confirm}
        onCancel={() => setConfirm(false)}
        confirmLabel={t('config.discard')}
        onConfirm={onClose}
      >
        <p>{t('widgets.discardHelp')}</p>
      </ConfirmDialog>
    </>
  );
}
