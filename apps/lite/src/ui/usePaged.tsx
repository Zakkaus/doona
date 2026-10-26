/**
 * One paging rule for every list table: 20 rows a page, and Astryx
 * Pagination under the table, on the end side, only when the rows do not
 * fit one page.
 */
import {useState} from 'react';
import {HStack} from '@astryxdesign/core/Layout';
import {Pagination} from '@astryxdesign/core/Pagination';
import {useMessages} from '../i18n';

export const PAGE_SIZE = 20;

export function usePaged<T>(rows: T[], pageSize = PAGE_SIZE) {
  const t = useMessages();
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  // Filtering can shrink the list under the current page.
  const current = Math.min(page, pageCount);
  const pageRows = rows.slice((current - 1) * pageSize, current * pageSize);
  const pager =
    rows.length > pageSize ? (
      <HStack hAlign="end">
        <Pagination label={t.pagination} page={current} onChange={setPage} totalItems={rows.length} pageSize={pageSize} />
      </HStack>
    ) : null;
  // Jump to the page holding `index`, so a newly added row can be revealed.
  const showIndex = (index: number) => setPage(Math.floor(index / pageSize) + 1);
  return {pageRows, pager, showIndex};
}
