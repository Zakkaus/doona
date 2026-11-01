import type {PageShape} from '../../ui/PageSkeleton';

// The policy list's first cards at their usual heights, drawn while the groups load: the page's own Skeleton and the
// route's, so both hold the list's top where the loaded list has it.
export const policyCards: PageShape = [
  {
    cards: [
      [674, 848],
      [110, 132],
      [110, 118],
      [110, 118]
    ],
    typical: true
  }
];
