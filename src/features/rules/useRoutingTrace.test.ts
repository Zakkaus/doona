import {expect, it, vi} from 'vitest';
const state = vi.hoisted(() => ({slots: [] as unknown[], slot: 0}));
vi.mock('react', async importOriginal => ({
  ...(await importOriginal<object>()),
  useMemo: (fn: () => unknown) => fn(),
  useState: (initial: unknown) => {
    const i = state.slot++;
    if (!(i in state.slots)) state.slots[i] = typeof initial === 'function' ? initial() : initial;
    return [
      state.slots[i],
      (next: unknown) => {
        state.slots[i] = next;
      }
    ];
  }
}));
vi.mock('../../ui/ui', () => ({useLinked: () => {}}));
const {useTraceForm: renderForm} = await import('./useRoutingTrace');
it('retains the accepted result in page state across trace tab unmounts', () => {
  const form = renderForm('');
  const result = {run: {traces: [], query: null}, input: {network: 'tcp' as const, domain: 'example.com', dst_port: 443}};
  expect(form.setResult).toBeTypeOf('function');
  form.setResult(result);
  state.slot = 0;
  expect(renderForm('tab=list').accepted).toBe(result);
  state.slot = 0;
  expect(renderForm('tab=trace').accepted).toBe(result);
});
