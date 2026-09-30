export type DiffLine = {kind: 'same' | 'add' | 'del'; text: string} | {kind: 'gap'; count: number};

// A line diff of two texts with `context` unchanged lines around each change; longer unchanged runs collapse to a gap
// that counts them. Equal texts give no lines.
export function lineDiff(before: string, after: string, context = 2): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  // Lines both texts share at the start and end need no table: only the stretch between them is compared.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const same = (lines: string[]) => lines.map(text => ({kind: 'same' as const, text}));
  const all = [...same(a.slice(0, start)), ...middle(a.slice(start, a.length - end), b.slice(start, b.length - end)), ...same(a.slice(a.length - end))];
  if (all.every(line => line.kind === 'same')) return [];
  const near = all.map((_, index) => all.slice(Math.max(0, index - context), index + context + 1).some(line => line.kind !== 'same'));
  const out: DiffLine[] = [];
  all.forEach((line, index) => {
    if (near[index]) out.push(line);
    else if (out.at(-1)?.kind === 'gap') (out.at(-1) as {count: number}).count++;
    else out.push({kind: 'gap', count: 1});
  });
  return out;
}

// Past this many table cells a changed stretch is shown as its old lines replaced by its new ones: the table grows with
// the product of the two lengths, and a rewrite that large reads no better line by line.
const maxCells = 1_000_000;
function middle(a: string[], b: string[]): Array<{kind: 'same' | 'add' | 'del'; text: string}> {
  if (a.length * b.length > maxCells) return [...a.map(text => ({kind: 'del' as const, text})), ...b.map(text => ({kind: 'add' as const, text}))];
  // Longest common subsequence lengths from the end, so the walk below can pick matches front to back.
  const lcs = Array.from({length: a.length + 1}, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: Array<{kind: 'same' | 'add' | 'del'; text: string}> = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({kind: 'same', text: a[i++]});
      j++;
    } else if (i < a.length && (j === b.length || lcs[i + 1][j] >= lcs[i][j + 1])) out.push({kind: 'del', text: a[i++]});
    else out.push({kind: 'add', text: b[j++]});
  }
  return out;
}
