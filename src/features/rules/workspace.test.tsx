import {expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import type {ReactNode} from 'react';

vi.mock('../../i18n', async importOriginal => {
  const original = await importOriginal<typeof import('../../i18n')>();
  return {...original, useT: () => (key: Parameters<typeof original.translate>[1]) => original.translate('en', key)};
});
const state = vi.hoisted(() => ({old: null as string | null, staged: false, trace: vi.fn()}));
vi.mock('./useDnsUpstreams', () => ({
  useDnsUpstreams: () => ({
    rows: [],
    draft: {old: state.old, name: 'primary', address: 'udp://1.1.1.1', staged: state.staged},
    setDraft: vi.fn()
  })
}));
vi.mock('./useDnsRuleList', () => ({
  useDnsRuleList: () => ({addReason: 'missing routing', copy: {label: 'rules'}}),
  useDnsRuleLinks: () => ({sourceHref: '#/config?tab=source&source=main&line=1'})
}));
vi.mock('./useRulesPage', () => ({useRulesPage: () => ({tabs: [], tab: 'list'})}));
vi.mock('./useRoutingTrace', () => ({useTraceForm: () => ({}), useRoutingTrace: state.trace}));
vi.mock('./RuleList', () => ({RuleList: () => null, RuleDictionary: () => null}));
vi.mock('./PendingRules', () => ({PendingRules: () => null}));
vi.mock('../../ui/ui', async importOriginal => ({
  ...(await importOriginal<object>()),
  Card: ({children}: {children: ReactNode}) => children,
  DataTable: () => null,
  Tabs: () => null,
  ConfirmDialog: ({children, locked}: {children: ReactNode; locked: boolean}) => <section data-locked={locked}>{children}</section>
}));
const {DnsUpstreams} = await import('./DnsUpstreams');
const {DnsRules} = await import('./DnsRules');
const {Rules} = await import('./Rules');

it.each([null, 'primary'])('shows rename help only when editing an existing name (%s)', old => {
  state.old = old;
  const markup = renderToStaticMarkup(<DnsUpstreams focus={false} />);
  expect(markup.includes('Renaming')).toBe(!!old);
});
it('locks dismissal while a cross-file rename is unfinished', () => {
  state.staged = true;
  expect(renderToStaticMarkup(<DnsUpstreams focus={false} />)).toContain('data-locked="true"');
  state.staged = false;
});
it('opens source repair instead of linking back to the upstream list when routing is missing', () => {
  expect(renderToStaticMarkup(<DnsRules query="tab=dns" go={() => {}} />)).toContain('href="#/config?tab=source&amp;source=main&amp;line=1"');
});
it('does not subscribe to trace resources while the trace tab is absent', () => {
  state.trace.mockClear();
  renderToStaticMarkup(<Rules query="" go={() => {}} />);
  expect(state.trace).not.toHaveBeenCalled();
});
