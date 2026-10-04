import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ChartWait, Meter, ProblemAlert, ProgressCircle, Skeleton, TableSkeleton} from './Feedback';

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
