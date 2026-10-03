import type {CSSProperties} from 'react';

export const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ');
// The rows in the first of an `rp-columns` list's two columns, which fill one after the other (widget-content.css).
export const columns = (rows: number) => ({'--rp-rows': Math.ceil(rows / 2)}) as CSSProperties;
