import type {PageShape} from '../../ui/PageSkeleton';

// The status row: the engine's state, its four facts and the reload's badge in the widths they take, over the page's
// actions. Drawn while the runtime loads, as the page's own Skeleton and the route's, so the row wraps as the loaded one does.
export const statusRow: PageShape = [{summary: {state: 60, facts: [96, 121, 103, 167], badge: 52, actions: [147, 52, 52]}}];
// The engine, counters and memory cards, then the datapath and backend cards, in the page's own grids and at the heights
// their loaded facts take, on a wide screen and on a phone. The datapath card's attachments table follows the data, so
// that card draws the box it is capped at, held to its top, and what follows it to its size.
export const overviewSkeleton: PageShape = [
  ...statusRow,
  {
    cards: [
      [410, 294],
      [410, 238],
      [410, 266]
    ],
    class: 'rp-g3'
  },
  {
    cards: [
      [464, 560],
      [242, 418]
    ],
    class: 'rp-g21 rp-overview-lower',
    typical: [0]
  },
  // The card of features that are off, which a backend that has them all on does not draw.
  {cards: [[169, 173]], typical: true}
];
