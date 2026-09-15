import {useEffect, useRef} from 'react';
import {Cell, Column, Row, Table, TableBody, TableHeader, TableLayout, Virtualizer} from 'react-aria-components';
import {chainLabel, connectionStates, relativeStart} from '../../api/selectors';
import type {Connection} from '../../api/model';
import {formatBytes} from '../../api/u64';
import {LOCALE, useLang, useT} from '../../i18n';

// Match the native table's measured row and collapsed-border header heights.
const layoutOptions = {rowHeight: 40, headingHeight: 36.5};

export function ConnectionTable({rows, selected, onSelect}: {rows: Connection[]; selected: string | null; onSelect: (id: string | null) => void}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const ref = useRef<HTMLDivElement | HTMLTableElement>(null);
  const selectedIndex = rows.findIndex(row => row.id === selected);
  useEffect(() => {
    // Wait for RAC to commit the virtual content height before revealing a deep link.
    const frame = requestAnimationFrame(() => {
      const table = ref.current;
      if (!table || selectedIndex < 0) return;
      const top = layoutOptions.headingHeight + selectedIndex * layoutOptions.rowHeight;
      const bottom = top + layoutOptions.rowHeight;
      if (top < table.scrollTop + layoutOptions.headingHeight) table.scrollTop = top - layoutOptions.headingHeight;
      else if (bottom > table.scrollTop + table.clientHeight) table.scrollTop = bottom - table.clientHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedIndex]);
  const cols = [
    {id: 'dst', label: t('ui.target'), width: 200, isRowHeader: true},
    {id: 'src', label: t('ui.source'), width: 136},
    {id: 'chain', label: t('conn.chain'), width: 180},
    {id: 'rule', label: t('conn.rule'), width: 220},
    {id: 'state', label: t('ui.state'), width: 100},
    {id: 'down', label: t('ui.download'), width: 88, align: 'end'},
    {id: 'age', label: t('ui.started'), width: 104, align: 'end'}
  ];
  return (
    <div
      className="rp-table"
      style={{height: 442}}
      onKeyDownCapture={event => {
        // RAC scopes Home/End to cells unless the row itself has focus.
        if (event.key === 'Home' || event.key === 'End') {
          (event.target as HTMLElement).closest<HTMLElement>('[role="row"][data-key]')?.focus({preventScroll: true});
        }
      }}
    >
      <Virtualizer layout={TableLayout} layoutOptions={layoutOptions}>
        <Table
          ref={ref}
          className="rp-connection-grid"
          aria-label={t('nav.connections')}
          aria-rowcount={rows.length + 1}
          selectionMode="single"
          selectionBehavior="replace"
          selectedKeys={selected ? [selected] : []}
          onSelectionChange={keys => onSelect(keys === 'all' || !keys.size ? null : String([...keys][0]))}
          disallowEmptySelection
        >
          <TableHeader>
            {cols.map(c => (
              <Column key={c.id} id={c.id} isRowHeader={c.isRowHeader} width={`${c.width}fr`} minWidth={c.width} className={c.align}>
                {c.label}
              </Column>
            ))}
          </TableHeader>
          <TableBody items={rows} dependencies={[locale]} renderEmptyState={() => <div className="empty">{t('conn.empty')}</div>}>
            {c => (
              <Row id={c.id} textValue={c.domain || c.dst || c.id}>
                {[
                  c.domain || c.dst || '—',
                  <span className="rp-code">{c.src ?? '—'}</span>,
                  chainLabel(c),
                  <span className="rp-rule">
                    <span title={c.rule_expression ?? undefined}>{c.rule_expression ?? '—'}</span>
                    {c.rule_source === 'recomputed' ? (
                      <small className="rp-provenance">{t('conn.recomputed')}</small>
                    ) : c.rule_source === 'unknown' ? (
                      <small className="rp-provenance">—</small>
                    ) : null}
                  </span>,
                  t(connectionStates[c.state]),
                  formatBytes(c.download_bytes),
                  relativeStart(c.started_at, locale)
                ].map((cell, i) => (
                  <Cell key={cols[i].id} className={cols[i].align}>
                    <span className="rp-connection-cell">{cell}</span>
                  </Cell>
                ))}
              </Row>
            )}
          </TableBody>
        </Table>
      </Virtualizer>
    </div>
  );
}
