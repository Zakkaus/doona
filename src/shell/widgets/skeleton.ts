import type {SkeletonSection} from '../../ui/PageSkeleton';

// The default Activity layout's cards in the cells of its five sections, as the startup Skeleton draws them before the
// dashboard's code is in: each card's module, then its footprint, its size and whether its height follows its data.
// The heights are dashboard.css's, which draws them at the widths the loaded cards take them; this table lives here,
// free of runtime imports, because the dashboard's code is not in the startup bundle, and a test compares it with
// dashboardLayout's defaults. A layout the reader changed redraws as DashboardSkeleton once it is.
export const defaultDashboard: readonly SkeletonSection[] = [
  {
    profile: 'quick',
    cards: [['mode', {foot: 'lead'}], ['global'], ['status']]
  },
  {
    profile: 'metrics',
    cards: [['download'], ['upload'], ['connections'], ['latency', {foot: 'tail'}], ['cpu', {foot: 'end'}]]
  },
  {
    profile: 'traffic',
    cards: [['history'], ['outbounds']]
  },
  {
    profile: 'details',
    cards: [['ranking'], ['memory'], ['notices', {foot: 'end'}]]
  },
  {
    profile: 'extensions',
    cards: [['nodeLatency', {size: 'wide', typical: true}], ['connectionOutbounds'], ['dnsAnswers'], ['policyGroups']]
  }
];
