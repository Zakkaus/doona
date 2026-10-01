import {useEffect} from 'react';
import {dashboardItems, type DashboardLayout} from './dashboardLayout';
import {ActivityCard} from '../../features/activity/widgets';

export function ModeJump({layout}: {layout: DashboardLayout}) {
  const present = dashboardItems(layout).some(item => item.id === 'mode');
  // Once per jump, on arrival: a later edit that adds or removes the mode card does not move focus. focus() scrolls the
  // card into view.
  useEffect(() => {
    const target = document.querySelector<HTMLElement>('main [data-module="mode"] .rp-card');
    if (target) {
      target.tabIndex = -1;
      target.focus();
    }
  }, []);
  return present ? null : (
    <div data-module="mode">
      <ActivityCard item={{id: 'mode'}} />
    </div>
  );
}
