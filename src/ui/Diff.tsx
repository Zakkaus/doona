import {cx} from './cx';

// A line diff as a unified listing: removed lines marked `-`, added `+`, and each gap of unchanged lines as `gap`, the
// caller's text for it. The marks are also read out, since colour alone does not say which side a line is on.
export type DiffRow = {kind: 'same' | 'add' | 'del'; text: string} | {kind: 'gap'; text: string};
const marks = {same: ' ', add: '+', del: '-', gap: ' '} as const;
export function Diff({rows, label}: {rows: DiffRow[]; label: string}) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The bounded listing needs keyboard focus to scroll.
    <pre className="rp-diff rp-code" role="region" aria-label={label} tabIndex={0}>
      {rows.map((row, index) => (
        <span key={index} className={cx('rp-diff-line', row.kind === 'gap' && 'rp-label')} data-kind={row.kind}>
          <span className="rp-diff-mark">{marks[row.kind]}</span>
          {row.text}
          {'\n'}
        </span>
      ))}
    </pre>
  );
}
