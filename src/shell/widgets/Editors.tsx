import {useMemo, useState, type ReactNode} from 'react';
import {useT} from '../../i18n';
import {Button, ConfirmDialog, ModalDialog, PopoverDialog, VisuallyHidden} from '../../ui/ui';
import {useDraftGuard} from '../draft';
import {saveDashboard} from './dashboardSettings';
import {SortableCanvas, reorderKeys} from '../../ui/SortableCanvas';
import {WidgetEditorLayout} from '../../ui/WidgetPanel';
import {minPanelSize} from '../../ui/panelSize';
import {WidgetContent} from './WidgetContent';
import {readLayout, saveLayout} from './settings';
import Settings from '../../ui/icons/Settings';
import {ModuleGallery, ModuleInspector} from './ModuleControls';
import {dashboardDefaults, dashboardItems, footprint, mapWidgets, type DashboardLayout} from './dashboardLayout';
import {placeWidget, sizesFor, stepWidget} from './dashboardEdit';
import {instanceId, defaults, registry, restoredPanel, changesPanel, type Widget, type WidgetId} from './layout';
import {addInstance, moveWidget} from './instances';

type Draft = {draft: DashboardLayout; setDraft: (draft: DashboardLayout) => void};
const replace = (draft: DashboardLayout, item: Widget) => mapWidgets(draft, old => (instanceId(old) === instanceId(item) ? item : old));

// The page in edit mode: the same sections and cells, as sortable canvases. Every tool sits in a card's corner or in
// a dialog, so nothing enters the page's flow.
export function DashboardEditor({draft, setDraft, render}: Draft & {render: (item: Widget) => ReactNode}) {
  const t = useT();
  const [announcement, setAnnouncement] = useState({text: '', serial: 0});
  const items = dashboardItems(draft);
  const announce = (text: string) => setAnnouncement(previous => ({text, serial: previous.serial + 1}));
  return (
    <>
      {draft.sections.map(section => (
        <SortableCanvas
          key={section.id}
          label={t('widgets.order')}
          profile={section.id}
          items={section.items.map(item => ({id: instanceId(item), module: item.id, size: item.size, foot: footprint(item), item}))}
          textValue={({item}) => t(registry[item.id].label)}
          dragLabel={({item}) => t('widgets.drag', {name: t(registry[item.id].label)})}
          onPlace={(id, place) => {
            setDraft(placeWidget(draft, id, {section: section.id, ...place}));
            announce(t('widgets.reordered'));
          }}
          tools={({item}) => (
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
                    sizes={sizesFor(section.id, registry[item.id].sizes)}
                    surface="dashboard"
                    update={next => setDraft(replace(draft, next))}
                    move={delta => {
                      setDraft(stepWidget(draft, instanceId(item), delta));
                      announce(t('widgets.reordered'));
                    }}
                    remove={() => {
                      setDraft(mapWidgets(draft, old => (instanceId(old) === instanceId(item) ? null : old)));
                      announce(t('widgets.removed', {name: t(registry[item.id].label)}));
                    }}
                  />
                </div>
              )}
            </PopoverDialog>
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
// New cards join the extensions section, whose grid takes any kind and size.
function extend(draft: DashboardLayout, id: WidgetId): DashboardLayout {
  const item = addInstance(dashboardItems(draft), id);
  if (!item) return draft;
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
          <ModuleGallery items={dashboardItems(draft)} add={id => setDraft(extend(draft, id))} surface="dashboard" />
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
export function WidgetEditor({onClose}: {onClose: () => void}) {
  const t = useT();
  const [original] = useState(() => readLayout().items);
  const [items, setItems] = useState(original);
  // Restoring the defaults also returns the panel to its corner and default size once saved.
  const [restored, setRestored] = useState(false);
  const [selected, select] = useState<string | null>(items[0] ? instanceId(items[0]) : null);
  const [confirm, setConfirm] = useState(false);
  const [announcement, setAnnouncement] = useState({text: '', serial: 0});
  const announce = (text: string) => setAnnouncement(previous => ({text, serial: previous.serial + 1}));
  // Saving a reset also moves the panel, so a reset counts as a change whenever the panel is not already at its default.
  const panelMoves = restored && changesPanel(readLayout());
  const dirty = useMemo(() => JSON.stringify(original) !== JSON.stringify(items), [original, items]) || panelMoves;
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
        size="large"
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
                select(null);
              }}
            >
              {t('widgets.reset')}
            </Button>
            <Button onPress={cancel}>{t('ui.cancel')}</Button>
            <Button
              accent
              onPress={() => {
                saveLayout(previous => ({...previous, version: 3, items, ...(restored && restoredPanel)}));
                onClose();
              }}
            >
              {t('settings.save')}
            </Button>
          </>
        )}
      >
        <WidgetEditorLayout
          width={readLayout().size?.width ?? minPanelSize.width}
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
              {({item}) => <WidgetContent item={item} preview sample />}
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
