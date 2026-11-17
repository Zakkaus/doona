import type {PageShape} from '../../ui/PageSkeleton';

// The traffic tab: its strip of facts, the busiest connection first, over the scatter and the latency cards.
export const trafficSkeleton: PageShape = [
  {facts: 3, lead: true, caption: true},
  {
    cards: [
      [430, 486],
      [322, 380]
    ]
  }
];
