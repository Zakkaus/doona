import type {ConnectionList} from '../../api/model';
import {connectionRows, sourceIp} from '../../api/selectors';
import {addU64, pctU64} from '../../api/u64';

export function connectionRanking(snapshot: ConnectionList | undefined, by: string) {
  const totals = new Map<string, bigint | null>();
  for (const row of connectionRows(snapshot)) {
    const name = by === 'dev' ? sourceIp(row.src) : row.domain || row.dst;
    if (!name) continue;
    totals.set(name, addU64(totals.has(name) ? totals.get(name)! : 0n, row.download_bytes));
  }
  const rows = [...totals].map(([name, download]) => ({name, download}));
  const total = addU64(...rows.map(row => row.download));
  rows.sort((a, b) => (a.download === b.download ? 0 : a.download === null ? 1 : b.download === null ? -1 : a.download > b.download ? -1 : 1));
  return rows.slice(0, 5).map(row => ({...row, percent: pctU64(row.download, total)}));
}
