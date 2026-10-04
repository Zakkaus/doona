import {lazy, Suspense, useState} from 'react';
import type {PageProps} from '../routes';
import {useT} from '../../i18n';
import {Button, Card, PageSkeleton, SkeletonCard, SkeletonGroup, useNearViewport} from '../../ui/ui';
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
import {scaleOf} from './dashboardSizing';
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
  if (!capabilities.data && capabilities.error) return null;
  // Once getting started is settled, the saved layout's cards stand in their places at their usual heights while the
  // capabilities arrive, and then draw their own first-load Skeletons. Before, the getting started card may still appear
  // above them, so the page's Skeleton stands in until the first-run reads decide it.
  if ((!capabilities.data && !setup.settled) || setup.pending) return <PageSkeleton />;
  if (!capabilities.data)
    return (
      <div className="rp-dashboard">
        <SkeletonGroup>
          {layout.sections
            .filter(section => section.items.length)
            .map(section => (
              <DashboardSection key={section.id} profile={section.id} grid={sectionGrid(section.items.map(tileOf))}>
                {section.items.map(item => (
                  <DashboardTile key={instanceId(item)} tile={tileOf(item)} visible={false} targetRef={null}>
                    <SkeletonCard height={tileHeight(item)} />
                  </DashboardTile>
                ))}
              </DashboardSection>
            ))}
        </SkeletonGroup>
      </div>
    );
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

// A card's usual height before its module knows what the backend offers: a control card, a metric tile, a chart card
// (taller by its chart's step), and a list card.
function tileHeight(item: Widget) {
  switch (item.id) {
    case 'mode':
    case 'global':
    case 'status':
      return 94;
    case 'download':
    case 'upload':
    case 'connections':
    case 'latency':
    case 'cpu':
      return 110;
    case 'history':
      return 106 + 120 * scaleOf(item);
    case 'outbounds':
      return 226;
    case 'memory':
      return item.form === 'sparkline' ? 110 : 260;
    default:
      return 260;
  }
}
