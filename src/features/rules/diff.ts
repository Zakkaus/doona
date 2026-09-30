export type DiffLine = {kind: 'same' | 'add' | 'del'; text: string} | {kind: 'gap'; count: number};

// A line diff of two texts with `context` unchanged lines around each change; longer unchanged runs collapse to a gap
// that counts them. Equal texts give no lines.
export function lineDiff(before: string, after: string, context = 2): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  // Longest common subsequence lengths from the end, so the walk below can pick matches front to back.
  const lcs = Array.from({length: a.length + 1}, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const all: Array<{kind: 'same' | 'add' | 'del'; text: string}> = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      all.push({kind: 'same', text: a[i++]});
      j++;
    } else if (i < a.length && (j === b.length || lcs[i + 1][j] >= lcs[i][j + 1])) all.push({kind: 'del', text: a[i++]});
    else all.push({kind: 'add', text: b[j++]});
  }
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
