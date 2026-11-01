import {SkeletonCard} from '../../ui/ui';
import type {PageShape} from '../../ui/PageSkeleton';
import {DashboardSection, DashboardTile, sectionGrid} from '../../ui/DashboardTile';
import {useDashboardLayout} from './dashboardSettings';
import {tileOf} from './dashboardLayout';
import {instanceId, type Widget, type WidgetId} from './layout';

// A card's usual height by module, on a wide screen and on a phone, as the default dashboard draws them with their
// data in. A list's height follows its rows, so it is held to its top only.
const heights: Partial<Record<WidgetId, readonly [number, number]>> = {
  mode: [66, 70],
  global: [66, 70],
  status: [66, 70],
  download: [146, 150],
  upload: [146, 150],
  connections: [146, 150],
  latency: [146, 150],
  cpu: [146, 114],
  history: [342, 134],
  outbounds: [342, 102],
  ranking: [260, 218],
  memory: [260, 264],
  notices: [260, 264],
  nodeLatency: [534, 594],
  connectionOutbounds: [146, 138],
  dnsAnswers: [146, 138],
  policyGroups: [146, 146]
};
const listed: ReadonlySet<WidgetId> = new Set(['nodeLatency']);
const tileHeight = (item: Widget) => (item.id === 'memory' && item.form === 'sparkline' ? ([110, 110] as const) : (heights[item.id] ?? ([260, 260] as const)));

// The saved layout's cards, each in its cell at its usual height, in the sections the dashboard lays out: the page's
// Skeleton, from startup until the capabilities arrive, inside the PageSkeleton the registry draws it in. The cells carry
// the layout's attributes but not the module, which names the loaded card for whatever looks for it and is gone when the
// cell is replaced.
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
                <SkeletonCard height={tileHeight(item)} typical={listed.has(item.id)} />
              </DashboardTile>
            ))}
          </DashboardSection>
        ))}
    </div>
  );
}

// The page's Skeleton shape: the saved layout's cards, which the page's code draws in place of the registry's default.
export const savedCards: PageShape = [{draw: DashboardSkeleton}];
