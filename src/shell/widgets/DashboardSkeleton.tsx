import {SkeletonCard} from '../../ui/ui';
import type {PageShape} from '../../ui/PageSkeleton';
import {DashboardSection, DashboardTile, sectionGrid} from '../../ui/DashboardTile';
import {useDashboardLayout} from './dashboardSettings';
import {tileOf} from './dashboardLayout';
import {instanceId, type Widget, type WidgetId} from './layout';

// The cards whose height follows their data, which a Skeleton holds to their top only.
export const listed: ReadonlySet<WidgetId> = new Set(['nodeLatency']);
// The name dashboard.css gives a card's heights: its module, and a memory card drawn as a sparkline is one line.
export const cardOf = (item: Widget) => (item.id === 'memory' && item.form === 'sparkline' ? 'memorySparkline' : item.id);

// The saved layout's cards, each in its cell at the height dashboard.css gives its module, in the sections the dashboard
// lays out: the page's Skeleton, from startup until the capabilities arrive, inside the PageSkeleton the registry draws
// it in. The cells carry the layout's attributes but not the module, which names the loaded card for whatever looks for
// it and is gone when the cell is replaced.
export function DashboardSkeleton() {
  const layout = useDashboardLayout();
  return (
    <div className="rp-dashboard">
      {layout.sections
        .filter(section => section.items.length)
        .map(section => (
          <DashboardSection key={section.id} profile={section.id} grid={sectionGrid(section.items.map(tileOf))}>
            {section.items.map(item => (
              <DashboardTile key={instanceId(item)} tile={{...tileOf(item), module: undefined}} visible={false} targetRef={null}>
                <SkeletonCard card={cardOf(item)} typical={listed.has(item.id)} />
              </DashboardTile>
            ))}
          </DashboardSection>
        ))}
    </div>
  );
}

// The page's Skeleton shape: the saved layout's cards, which the page's code draws in place of the registry's default.
export const savedCards: PageShape = [{draw: DashboardSkeleton}];
