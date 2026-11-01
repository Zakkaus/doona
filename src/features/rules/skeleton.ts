import type {PageShape} from '../../ui/PageSkeleton';

// The routing list's simple view: its row of caption, service button and view switch over the template card. Drawn
// while the configuration that decides between the views is read, as the page's own Skeleton and the route's, so the
// toolbar wraps on a phone as the loaded one does.
export const ruleListSkeleton: PageShape = [
  {toolbar: 3, end: 2, height: [32, 84]},
  {cards: [[748, 864]], typical: true}
];
