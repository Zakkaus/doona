import type {PageShape} from '../../ui/PageSkeleton';
import {allConfigTabs} from './tabs';

// The first read's Skeletons: the summary row, then the tab row over the Modules tab's cards, the usual first tab, while
// the tabs are not known yet. The route draws all of it before the page's code arrives.
export const summaryRow: PageShape = [{toolbar: 3, height: 24}];
export const moduleCards: PageShape = [{cards: [94, 94, 94, 94, 94, 94, 94], gap: 'page', typical: true}];
export const configSkeleton: PageShape = [...summaryRow, {tabs: allConfigTabs.map(tab => tab.titleKey)}, ...moduleCards];
