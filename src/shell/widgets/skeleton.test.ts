import {expect, it} from 'vitest';
import dashboardCss from '../../ui/styles/dashboard.css?raw';
import {dashboardDefaults, tileOf} from './dashboardLayout';
import {cardOf, listed} from './DashboardSkeleton';
import {defaultDashboard} from './skeleton';

// The startup Skeleton keeps the default layout's cards as a table because the dashboard's code is not in the startup
// bundle; they must stay what DashboardSkeleton draws for that layout.
it('draws the default layout card for card, as DashboardSkeleton does', () => {
  const drawn = defaultDashboard.map(({profile, cards}) => ({
    profile,
    cards: cards.map(([card, cell]) => ({
      card,
      foot: cell?.foot,
      size: cell?.size === 'wide' ? 'wide' : 'medium',
      typical: !!cell?.typical
    }))
  }));
  const layout = dashboardDefaults().sections.map(({id, items}) => ({
    profile: id,
    cards: items.map(item => ({
      card: cardOf(item),
      foot: tileOf(item).foot,
      size: item.size === 'wide' ? 'wide' : 'medium',
      typical: listed.has(item.id)
    }))
  }));
  expect(drawn).toEqual(layout);
});

// A card's height is dashboard.css's, by module name; a default card it does not name would draw 260px.
it('gives every default card its heights in dashboard.css', () => {
  const unnamed = defaultDashboard.flatMap(({cards}) => cards.map(([card]) => card)).filter(card => !dashboardCss.includes(`[data-card='${card}']`));
  expect(unnamed).toEqual([]);
});
