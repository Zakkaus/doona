import {lazy, Suspense, useState} from 'react';
import type {PageProps} from '../routes';
import {useT} from '../../i18n';
import {Button, Card, Loading, useNearViewport} from '../../ui/ui';
import {PageActions} from '../../ui/PageActions';
import {DashboardSection, DashboardTile, sectionGrid} from '../../ui/DashboardTile';
import {useCapabilities} from '../../store';
import {ResourcePreview} from '../../store/preview';
import {useDashboardLayout, saveDashboard} from './dashboardSettings';
import {dashboardItems, mapWidgets, tileOf, type DashboardLayout} from './dashboardLayout';
import {instanceId, registry, replaceWidget, type Widget} from './layout';
import {GettingStarted, RuntimeAlert, useGettingStarted} from '../../features/activity/widgets';
import {ModeJump} from './ModeJump';
import {WidgetCard} from './WidgetCard';
import '../../ui/styles/dashboard.css';
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
  const update = (item: Widget) => saveDashboard(previous => mapWidgets(previous, replaceWidget(item)));
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
              <DashboardSection key={section.id} profile={section.id} grid={sectionGrid(section.items.map(tileOf))}>
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
    <DashboardTile tile={tileOf(item)} visible={visible} targetRef={ref}>
      <ResourcePreview value={!visible}>
        <WidgetCard item={item} onChange={onChange} />
      </ResourcePreview>
    </DashboardTile>
  );
}
