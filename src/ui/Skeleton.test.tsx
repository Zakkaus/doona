import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {PageSkeleton} from './PageSkeleton';
import {Skeleton, SkeletonBar, SkeletonBody, SkeletonCover, SkeletonGroup, TableSkeleton} from './Skeleton';

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

it('waits before a cover shows and reads no status of its own', () => {
  const markup = renderToStaticMarkup(<SkeletonCover />);
  expect(markup).toContain('data-wait=""');
  expect(markup).toContain('aria-hidden="true"');
  expect(markup).not.toContain('role="status"');
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

// Features draw a Skeleton only through the kit's parts, which wait 150ms and read one status; a raw placeholder class
// in a feature shows at once and reads nothing.
it('keeps raw skeleton and placeholder classes out of features', () => {
  const sources = import.meta.glob<string>(['/src/features/**/*.tsx', '!/src/**/*.test.*'], {query: '?raw', import: 'default', eager: true});
  const raw = Object.keys(sources).filter(path => /rp-wait-line|rp-skeleton|rp-table-skeleton|rp-page-skeleton/.test(sources[path]));
  expect(raw).toEqual([]);
});
