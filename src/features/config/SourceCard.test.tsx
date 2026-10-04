import {beforeAll, expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import type {ReactNode} from 'react';
import {preloadEditor, SourceCard} from './SourceCard';
import type {SourceCardProps} from './useConfigPage';
import type {DiagnosticRow} from './view';

const state = vi.hoisted(() => ({diagnostics: {} as Record<string, unknown>, restart: [] as unknown[]}));
vi.mock('../../ui/code/CodeEditor', () => ({CodeEditor: ({banner}: {banner: ReactNode}) => banner}));
// The editor loads lazily; once loaded it renders without suspending, so static markup includes it.
beforeAll(() => preloadEditor());
vi.mock('./useConfigPage', () => ({
  useSourceCard: () => ({
    links: [],
    restart: state.restart,
    diagnostics: state.diagnostics,
    marks: [],
    text: '',
    view: {label: 'main'},
    saveButton: {},
    note: ''
  })
}));

const row = (id: string, backend: string | null): Partial<DiagnosticRow> => ({
  id,
  tone: 'warn',
  levelText: 'Warning',
  text: `Line 1: ${id}`,
  backend,
  action: null
});
const render = (diagnostics: Record<string, unknown>) => {
  state.restart = [];
  state.diagnostics = {errors: 0, warnings: 0, scope: 'Draft diagnostics', quiet: null, open: true, rows: [], level: 'all', levels: [], ...diagnostics};
  return renderToStaticMarkup(<SourceCard {...({canValidate: false, source: {id: 'main'}} as SourceCardProps)} />);
};

it.each([
  ['words that repeat the message', [row('Unknown section "oops"', 'Unknown section "oops"')], 1],
  ['words beside a translation', [row('a', 'first'), row('b', 'second')], 2],
  ['no backend words', [row('a', null)], 0]
])('gives every row with backend words its Details toggle: %s', (_, rows, toggles) => {
  const markup = render({warnings: rows.length, rows});
  expect(markup.match(/>詳細</g) ?? []).toHaveLength(toggles);
  for (const item of rows) if (item.backend) expect(markup).toContain(`<code>${item.backend.replaceAll('"', '&quot;')}</code>`);
});

it.each([
  ['errors', {errors: 2, warnings: 1}, [/rp-badge negative"[^>]*>錯誤 2</, /rp-badge warn"[^>]*>警告 1</]],
  ['warnings only', {errors: 0, warnings: 3}, [/rp-badge"[^>]*>錯誤 0</, /rp-badge warn"[^>]*>警告 3</]]
])('summarises %s as toned badges in one bar trigger', (_, counts, badges) => {
  const markup = render({...counts, open: false, rows: [row('a', null)]});
  for (const badge of badges) expect(markup).toMatch(badge);
  expect(markup).toMatch(/<button[^>]*rp-disclosure-trigger[^>]*>.*錯誤.*Draft diagnostics.*<\/button>/);
});

it('keeps a quiet line in the bar when there is nothing to list', () => {
  const markup = render({quiet: 'No diagnostics'});
  expect(markup).toContain('class="rp-config-diagnostics"');
  expect(markup).toContain('rp-config-diagnostics-quiet rp-label">No diagnostics<');
  expect(markup).not.toContain('rp-disclosure-trigger');
});

it('tells a write refused for a restart: the settings, that nothing was written and the command to run', () => {
  state.restart = [
    {key: 'global.log_level', sourceId: 'main', line: null},
    {key: 'dns.bind', sourceId: 'rules', line: 3}
  ];
  const sources = [{id: 'main'}, {id: 'rules', path: '/etc/honk/rules.dae'}];
  const markup = renderToStaticMarkup(<SourceCard {...({canValidate: false, source: {id: 'main'}, sources} as unknown as SourceCardProps)} />);
  expect(markup).toContain('2 項設定需重新啟動');
  expect(markup).toContain('未寫入');
  for (const key of ['global.log_level', 'dns.bind']) expect(markup).toContain(`<code class="rp-code">${key}</code>`);
  expect(markup).toContain('rules.dae:3');
  expect(markup).toContain('systemctl restart honk-core');
  expect(markup).toContain('install.html#reload-and-restart');
});
