import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ChartWait, Meter, ProblemAlert, ProgressCircle, Skeleton, SkeletonBar, SkeletonBody, SkeletonGroup, TableSkeleton} from './Feedback';
import {PageSkeleton} from './PageSkeleton';

it.each([
  [undefined, 'negative', 'alert'],
  ['negative', 'negative', 'alert'],
  ['neutral', 'informative', 'status']
] as const)('shows a %s problem with the %s tone', (kind, tone, role) => {
  const markup = renderToStaticMarkup(<ProblemAlert problem={{id: 1, text: 'Saved, not confirmed.', kind}} />);
  expect(markup).toContain(`rp-alert ${tone}`);
  expect(markup).toContain(`role="${role}"`);
});

it.each([
  [undefined, 'rp-chart-wait'],
  ['tall', 'rp-chart-wait tall']
] as const)('holds a %s chart place with one block', (holds, className) => {
  expect(renderToStaticMarkup(<ChartWait holds={holds}>Loading</ChartWait>)).toBe(`<div class="${className}">Loading</div>`);
});

it('reads a meter as its value text, filled to its share', () => {
  const markup = renderToStaticMarkup(<Meter label="Usage" value={42} valueLabel="420 GB / 1 TB" tone="warn" />);
  expect(markup).toMatch(/role="meter\b/);
  expect(markup).toContain('aria-valuenow="42"');
  expect(markup).toContain('aria-valuetext="420 GB / 1 TB"');
  expect(markup).toContain('rp-meter warn');
  expect(markup).toContain('width:42%');
  expect(markup).not.toContain('data-size');
});

it('marks a small meter for its own label and track sizes', () => {
  expect(renderToStaticMarkup(<Meter size="S" label="Usage" value={42} valueLabel="420 GB / 1 TB" />)).toContain('data-size="S"');
});

it.each([
  ['S', '0 0 16 16', '7'],
  ['M', '0 0 32 32', '14.5']
] as const)('draws an indeterminate %s progress circle with its own stroke', (size, box, r) => {
  const markup = renderToStaticMarkup(<ProgressCircle size={size} aria-label="Loading" />);
  expect(markup).toContain('role="progressbar"');
  expect(markup).not.toContain('aria-valuenow');
  expect(markup).toContain(`data-size="${size}"`);
  expect(markup).toContain(`viewBox="${box}"`);
  expect(markup).toContain(`r="${r}"`);
});

it('holds a body of facts with inert placeholders and a loading status', () => {
  const markup = renderToStaticMarkup(<Skeleton facts={3} helped={[2]} below={40} />);
  expect(markup.match(/class="rp-skeleton-text"/g)).toHaveLength(7);
  expect(markup.match(/class="k helped"/g)).toHaveLength(1);
  expect(markup).toContain('role="status"');
  expect(markup).toContain('height:40px');
  expect(markup.match(/inert=""/g)).toHaveLength(2);
});

it('holds a table body with a bar per cell but none in the actions column, waiting before it shows', () => {
  const cols = [
    {minWidth: 200, isRowHeader: true},
    {minWidth: 96, grow: 0},
    {minWidth: 48, actions: true}
  ];
  const markup = renderToStaticMarkup(<TableSkeleton cols={cols} rows={4} />);
  expect(markup).toContain('grid-template-columns:minmax(200px, 400fr) minmax(96px, 0fr) minmax(48px, 48fr)');
  expect(markup.match(/<span><span class="rp-skeleton-text"/g)).toHaveLength(8);
  expect(markup.match(/<span><\/span>/g)).toHaveLength(4);
  expect(new Set(markup.match(/width:\d+%/g)).size).toBeGreaterThan(2);
  expect(markup).toContain('data-wait=""');
  expect(markup).toContain('role="status"');
  expect(markup).toContain('aria-hidden="true"');
});

// Every shape waits 150ms, reads one loading status and keeps its drawing inert and hidden from assistive technology.
it.each([
  ['a block', <SkeletonBody shape="block" />, /class="rp-skeleton-text"/g, 1],
  ['rows', <SkeletonBody shape="rows" count={4} />, /class="rp-skeleton-row"/g, 4],
  ["bars in the Bar's own parts", <SkeletonBody shape="bars" count={5} columns />, /class="rp-bar"/g, 5],
  ['fields', <SkeletonBody shape="fields" count={2} />, /class="rp-skeleton-field"/g, 2],
  ['cards in a grid', <SkeletonBody shape="cards" count={3} height={120} grid />, /class="rp-card" style="height:120px"/g, 3],
  ["a page body in its route's shape", <PageSkeleton shape={[{toolbar: 2}, {cards: [94, 94], columns: 2}]} />, /class="rp-card"/g, 2],
  ['bars in a group', <SkeletonGroup>{[<SkeletonBar key="a" />, <SkeletonBar key="b" line="caption" />]}</SkeletonGroup>, /rp-skeleton-bar/g, 2]
])('holds %s while the first data loads', (_name, node, part, count) => {
  const markup = renderToStaticMarkup(node);
  expect(markup.match(part)).toHaveLength(count);
  expect(markup.match(/role="status"/g)).toHaveLength(1);
  expect(markup.match(/data-wait=""/g)).toHaveLength(1);
  expect(markup.match(/aria-hidden="true"/g)).toHaveLength(count);
});

it("lays ranking bars out as a wide card's list only when asked", () => {
  expect(renderToStaticMarkup(<SkeletonBody shape="bars" count={4} columns />)).toContain('rp-list rp-columns');
  expect(renderToStaticMarkup(<SkeletonBody shape="bars" count={4} />)).not.toContain('rp-columns');
});

// The loading rule (CONTRIBUTING, Loading states): a first load whose shape is known draws a Skeleton, and the
// progress circle is kept for waits whose shape is unknown or tiny. A new page follows the rule or joins this list.
const progressCircleWaits = {
  'src/shell/Shell.tsx': 'the sign-in page chunk',
  'src/shell/Login.tsx': 'sign-in discovery',
  'src/shell/search/SearchDialog.tsx': 'results while typing'
};
it('keeps the progress circle to the waits on its list', () => {
  const sources = import.meta.glob<string>(['/src/main.tsx', '/src/shell/**/*.tsx', '/src/features/**/*.tsx', '!/src/**/*.test.*'], {
    query: '?raw',
    import: 'default',
    eager: true
  });
  const using = Object.keys(sources).filter(path => /<Loading\b/.test(sources[path]));
  expect(using.map(path => path.slice(1)).sort()).toEqual(Object.keys(progressCircleWaits).sort());
});
