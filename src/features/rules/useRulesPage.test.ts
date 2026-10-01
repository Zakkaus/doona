import {expect, it, vi} from 'vitest';
vi.mock('../../store', () => ({useCapabilities: () => ({}), useFlowDemand: () => {}}));
vi.mock('../../i18n', () => ({useT: () => (key: string) => key}));
const {useRulesPage} = await import('./useRulesPage');
it.each(['simple', 'advanced'])('drops retired view=%s when switching tabs while preserving other URL state', view => {
  const go = vi.fn();
  useRulesPage({query: `view=${view}&held=1`, go}).changeTab('trace');
  expect(go).toHaveBeenCalledWith('rules', 'held=1&tab=trace');
});
