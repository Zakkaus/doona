import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {GridList} from 'react-aria-components';
import {TableCard, TableCards} from './TableCards';
import type {TableColumn} from './Table';

type Row = {id: string; target: string; rule: string; state: string};
const cols: TableColumn<Row>[] = [
  {id: 'target', label: 'Target', minWidth: 128, isRowHeader: true, render: row => row.target},
  {id: 'rule', label: 'Rule', minWidth: 152, wide: true, render: row => row.rule},
  {id: 'state', label: 'State', minWidth: 112, render: row => row.state},
  {id: 'actions', label: 'Actions', minWidth: 88, actions: true, render: () => <button type="button">Add</button>}
];

// The row header titles the card with the actions at its end; every other column is a labelled fact, a wide one on a
// row of its own.
it('draws each row as a card of labelled facts', () => {
  const markup = renderToStaticMarkup(
    <GridList aria-label="Records" items={[{id: 'a', target: 'example.com', rule: 'domain(example.com)', state: 'Active'}]}>
      {row => <TableCard row={row} cols={cols} title={row.target} />}
    </GridList>
  );
  expect(markup).toMatch(/class="[^"]*rp-cardview-title"[^>]*>example\.com</);
  expect(markup).toMatch(/class="rp-cardview-actions"><button[^>]*>Add</);
  expect(markup).toMatch(/<div class="wide"><span class="k">Rule<\/span><span class="v">domain\(example\.com\)<\/span>/);
  expect(markup).toMatch(/<div><span class="k">State<\/span><span class="v">Active<\/span>/);
  expect(markup).not.toContain('>Target<');
});

it('holds the cards box while the first rows load', () => {
  const markup = renderToStaticMarkup(<TableCards label="Records" cols={cols} rows={[]} loading getTextValue={row => row.target} />);
  expect(markup).toContain('rp-skeleton-cards');
  expect(markup).not.toContain('role="grid"');
});
