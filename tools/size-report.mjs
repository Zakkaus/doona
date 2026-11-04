// The size report: `check:size --json` writes one measurement per build, and this renders a pull request's measurement against
// main's as the Markdown table CI shows in the run summary and in the pull request comment. The renderer also reads files built
// from a fork's code, so it validates every field and prints names only through `code`.
import {existsSync, readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const marker = '<!-- size-report -->';
const sha = /^[0-9a-f]{40}$/;
const partsKept = 20;
const partsShown = 5;
// A measurement has a handful of budgets; more than these is not one of ours, so it is rejected whole.
const budgetsMax = 50;
const partsMax = 200;

// The measurement as written to JSON: one row per budget with its worst entry and that entry's largest files.
export function summarize(results, total, {commit, base} = {}) {
  return {
    schema: 1,
    commit: sha.test(commit ?? '') ? commit : null,
    base: sha.test(base ?? '') ? base : null,
    budgets: results.map(({name, limit, worst}) => ({
      name,
      limit,
      bytes: worst.bytes,
      label: worst.label,
      parts: worst.parts.slice(0, partsKept).map(([file, bytes]) => ({file, bytes}))
    })),
    total
  };
}

const count = value => (Number.isSafeInteger(value) && value >= 0 ? value : null);
const text = value => (typeof value === 'string' ? value : '');

// Keeps what the report needs from a measurement and drops anything malformed, so a bad file shows as missing data.
export function parse(data) {
  if (data?.schema !== 1 || !Array.isArray(data.budgets) || data.budgets.length > budgetsMax) return null;
  if (data.budgets.some(budget => Array.isArray(budget?.parts) && budget.parts.length > partsMax)) return null;
  const budgets = data.budgets
    .filter(budget => /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(text(budget?.name)))
    .map(({name, limit, bytes, label, parts}) => ({
      name,
      limit: count(limit),
      bytes: count(bytes),
      label: text(label),
      parts: (Array.isArray(parts) ? parts : [])
        .slice(0, partsKept)
        .flatMap(part => (count(part?.bytes) === null ? [] : [{file: text(part.file), bytes: part.bytes}]))
    }));
  return {
    commit: sha.test(text(data.commit)) ? data.commit : null,
    base: sha.test(text(data.base)) ? data.base : null,
    budgets,
    total: {js: count(data.total?.js), css: count(data.total?.css)}
  };
}

// A name in a code span, reduced to the characters file names and labels use.
const code = value => `\`${value.replace(/[^\w./@?=&()*\- ]/g, '').slice(0, 120) || '?'}\``;
const short = commit => commit.slice(0, 8);
const kb = bytes => (bytes === null ? '—' : `${(bytes / 1000).toFixed(1)} KB`);
const change = (now, before) => (now === null || before === null ? '—' : `${now > before ? '+' : now < before ? '−' : ''}${Math.abs(now - before)} B`);
// Vite names built files `name-hash.ext`; without the hash, a file can be matched across builds.
const unhashed = file => file.replace(/-[\w-]{8}(\.\w+)$/, '-*$1');

function partsTable({name, bytes, parts}, before) {
  const previous = new Map();
  for (const part of before?.parts ?? []) {
    const key = unhashed(part.file);
    previous.set(key, previous.has(key) ? null : part.bytes);
  }
  const rows = parts.slice(0, partsShown).map(part => {
    const key = unhashed(part.file);
    return `| ${code(key)} | ${kb(part.bytes)} | ${previous.has(key) ? change(part.bytes, previous.get(key)) : before ? 'new' : '—'} |`;
  });
  return [`**${name}** (${change(bytes, before?.bytes ?? null)})`, '', '| Part | This PR | Change |', '|---|---|---|', ...rows].join('\n');
}

// `current` is this build's measurement; `baseline` is main's, or null when main has none.
export function render(current, baseline) {
  if (!current) return `❌ **Size report**: the measurement is missing or unreadable.\n${marker}\n`;
  const before = new Map((baseline?.budgets ?? []).map(budget => [budget.name, budget]));
  const over = current.budgets.filter(({bytes, limit}) => bytes === null || limit === null || bytes > limit);
  const head = current.commit ? `${short(current.commit)} ` : '';
  let against;
  if (!baseline) against = 'with no `main` measurement to compare';
  else if (baseline.commit && baseline.commit === current.base) against = `vs \`main\` ${short(baseline.commit)}`;
  else {
    const missing = current.base ? `, none for the base ${short(current.base)}` : '';
    against = `vs the newest \`main\` measurement${baseline.commit ? ` ${short(baseline.commit)}` : ''}${missing}`;
  }
  const verdict = over.length ? `${over.length} over limit (${over.map(({name}) => name).join(', ')})` : 'no limits exceeded';
  const lines = [
    `${over.length ? '❌' : '✅'} **Size report** ${head}${against}: ${verdict}`,
    '',
    'Gzip bytes each budget counts; a limit is a fixed ceiling in `sizeBudget` in `package.json`.',
    '',
    '| | This PR | `main` | Change | Limit |',
    '|---|---|---|---|---|'
  ];
  for (const budget of current.budgets) {
    const previous = before.get(budget.name)?.bytes ?? null;
    const mark = over.includes(budget) ? '❌ ' : '';
    lines.push(
      `| ${mark}${code(budget.name)} (${code(budget.label)}) | ${kb(budget.bytes)} | ${kb(previous)} | ${change(budget.bytes, previous)} | ${kb(budget.limit)} |`
    );
  }
  const grew = current.budgets.filter(budget => {
    const previous = before.get(budget.name)?.bytes;
    return budget.bytes !== null && Number.isSafeInteger(previous) && budget.bytes > previous && budget.parts.length;
  });
  if (grew.length) {
    lines.push('', `<details><summary>Largest parts of the ${grew.length} ${grew.length === 1 ? 'budget' : 'budgets'} that grew</summary>`, '');
    for (const budget of grew) lines.push(partsTable(budget, before.get(budget.name)), '');
    lines.push('</details>');
  }
  if (current.total.js !== null && current.total.css !== null) {
    lines.push('', `Everything built, for information: JS ${kb(current.total.js)}, CSS ${kb(current.total.css)}.`);
  }
  lines.push(marker);
  return `${lines.join('\n')}\n`;
}

const load = path => {
  if (!path || !existsSync(path)) return null;
  try {
    return parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return null;
  }
};

// node tools/size-report.mjs <measurement.json> [<main-measurement.json>] prints the report.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.stdout.write(render(load(process.argv[2]), load(process.argv[3])));
}
