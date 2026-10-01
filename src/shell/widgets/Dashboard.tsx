import {lazy, Suspense, useState} from 'react';
import type {PageProps} from '../routes';
import {useT} from '../../i18n';
import {Button, Card, Loading, useNearViewport} from '../../ui/ui';
import {PageActions} from '../../ui/PageActions';
import {DashboardSection, DashboardTile} from '../../ui/DashboardTile';
import {useCapabilities} from '../../store';
import {ResourcePreview} from '../../store/preview';
import {useDashboardLayout, saveDashboard} from './dashboardSettings';
import {dashboardItems, footprint, mainCard, type DashboardLayout} from './dashboardLayout';
import {instanceId, registry, type Widget} from './layout';
import {ActivityCard, GettingStarted, RuntimeAlert, useGettingStarted} from '../../features/activity/widgets';
import {ModeJump} from './ModeJump';
import '../../ui/styles/dashboard.css';
const WidgetContent = lazy(() => import('./WidgetContent').then(module => ({default: module.WidgetContent})));
const DashboardEditor = lazy(() => import('./Editors').then(module => ({default: module.DashboardEditor})));
const DashboardActions = lazy(() => import('./Editors').then(module => ({default: module.DashboardActions})));
export function Activity({query}: PageProps) {
  const t = useT();
  const setup = useGettingStarted();
  const layout = useDashboardLayout();
  const [draft, setDraft] = useState<DashboardLayout | null>(null);
  const capabilities = useCapabilities();
  const editing = draft !== null;
  const close = () => setDraft(null);
  if (!capabilities.data) return capabilities.error ? null : <Loading />;
  if (setup.pending) return <Loading />;
  // A card's own choices, such as its group, save at once outside the editor.
  const update = (item: Widget) =>
    saveDashboard(previous => ({
      ...previous,
      sections: previous.sections.map(section => ({...section, items: section.items.map(old => (instanceId(old) === instanceId(item) ? item : old))}))
    }));
  return (
    <>
      <PageActions>
        {editing ? (
          <Suspense>
            <DashboardActions draft={draft} saved={layout} setDraft={setDraft} onClose={close} />
          </Suspense>
        ) : (
          <Button onPress={() => setDraft(layout)}>{t('dashboard.edit')}</Button>
        )}
      </PageActions>
      {new URLSearchParams(query).get('card') === 'mode' && <ModeJump layout={layout} />}
      <GettingStarted model={setup} />
      {!dashboardItems(layout).some(item => item.id === 'status') && dashboardItems(layout).some(item => registry[item.id].resource === 'runtime') && (
        <RuntimeAlert />
      )}
      <div className="rp-dashboard" data-editing={editing || undefined}>
        {editing ? (
          <Suspense>
            <ResourcePreview value>
              <DashboardEditor draft={draft} setDraft={setDraft} render={item => <WidgetCard item={item} />} />
            </ResourcePreview>
          </Suspense>
        ) : (
          layout.sections
            .filter(section => section.items.length)
            .map(section => (
              <DashboardSection key={section.id} profile={section.id}>
                {section.items.map(item => (
                  <DashboardModule key={instanceId(item)} item={item} onChange={update} />
                ))}
              </DashboardSection>
            ))
        )}
        {!dashboardItems(draft ?? layout).length && (
          <Card>
            <span className="rp-label">{t('widgets.empty')}</span>
          </Card>
        )}
      </div>
    </>
  );
}
function DashboardModule({item, onChange}: {item: Widget; onChange: (item: Widget) => void}) {
  const [ref, visible] = useNearViewport(undefined, 0);
  return (
    <DashboardTile tile={{id: instanceId(item), module: item.id, size: item.size, foot: footprint(item)}} visible={visible} targetRef={ref}>
      <ResourcePreview value={!visible}>
        <WidgetCard item={item} onChange={onChange} />
      </ResourcePreview>
    </DashboardTile>
  );
}
// The renderer follows the card's kind and display, never its size, so resizing keeps the same content mounted.
export function WidgetCard({item, preview = false, onChange = () => {}}: {item: Widget; preview?: boolean; onChange?: (item: Widget) => void}) {
  const t = useT();
  if (mainCard(item))
    return (
      <ActivityCard
        item={item}
        ranking={{by: item.by === 'domain' ? 'host' : 'dev', setBy: by => onChange({...item, by: by === 'host' ? 'domain' : 'dev'})}}
        selection={{chosen: item.group ?? '', setChosen: group => onChange({...item, group})}}
      />
    );
  return (
    <Card title={t(registry[item.id].label)}>
      <Suspense>
        <WidgetContent item={item} dashboard preview={preview} onChange={onChange} />
      </Suspense>
    </Card>
  );
}
