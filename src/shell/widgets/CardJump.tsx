import {dashboardItems, type DashboardLayout} from './dashboardLayout';
import {ActivityCard} from '../../features/activity/widgets';
import {useLanding} from '../../ui/landing';

// `?card=` lands on the first card of that kind on the dashboard. The mode card is the one other pages send people to
// change, so it is shown above the cards when the reader's layout has none.
export function CardJump({card, layout}: {card: string; layout: DashboardLayout}) {
  const present = dashboardItems(layout).some(item => item.id === card);
  // A card the reader removed is not waited for: the link opens the page, as it would without the card.
  useLanding(present || card === 'mode' ? card : null, () => {
    const target = document.querySelector<HTMLElement>(`main [data-module="${CSS.escape(card)}"] .rp-card`);
    return target && {target};
  });
  return present || card !== 'mode' ? null : (
    <div data-module="mode">
      <ActivityCard item={{id: 'mode'}} />
    </div>
  );
}
