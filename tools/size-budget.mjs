// Download budgets by user path. Sizes are gzip bytes; `size(file)` returns the size of one built file.
export const loginKey = 'src/shell/Login.tsx';
export const chartKeys = ['src/ui/charts/Donut.tsx', 'src/ui/charts/AreaChart.tsx', 'src/ui/charts/Sparkline.tsx'];
export const configKey = 'src/features/config/Config.tsx';
export const mockKey = 'mock/index.ts';
export const budgetNames = ['startupLogin', 'startupActivity', 'startupCss', 'locale', 'fontCss', 'route', 'routeConfig', 'mock'];

// Static import closure of a manifest key; dynamic imports are separate downloads and stay out.
export function closure(manifest, key, seen = new Set()) {
  if (seen.has(key)) return seen;
  if (!manifest[key]) throw new Error(`Missing manifest chunk: ${key}`);
  seen.add(key);
  for (const dependency of manifest[key].imports ?? []) closure(manifest, dependency, seen);
  return seen;
}

const filesOf = (manifest, keys) => new Set([...keys].flatMap(key => [manifest[key].file, ...(manifest[key].css ?? [])]));
const union = (...sets) => new Set(sets.flatMap(set => [...set]));
const withClosure = (manifest, keys) => filesOf(manifest, union(...keys.map(key => closure(manifest, key))));

// A budget entry is what one user downloads: the files it counts, and the bytes they add up to.
function entry(budget, label, files, ext, size) {
  const parts = [...files].filter(file => file.endsWith(ext)).map(file => [file, size(file)]);
  return {budget, label, bytes: parts.reduce((sum, [, bytes]) => sum + bytes, 0), parts: parts.sort((a, b) => b[1] - a[1])};
}

export function measure(manifest, size) {
  const entries = Object.entries(manifest);
  const keyOf = (label, pick) => {
    const found = entries.find(([, chunk]) => pick(chunk));
    if (!found) throw new Error(`Manifest has no ${label}; update tools/size-budget.mjs with the build layout.`);
    return found[0];
  };
  const entryKey = keyOf('entry chunk', chunk => chunk.isEntry);
  const activityKey = keyOf('activity chunk', chunk => chunk.name === 'activity' && chunk.file.endsWith('.js'));
  const locales = entries.filter(([, chunk]) => chunk.src?.startsWith('src/i18n/locales/')).map(([key]) => key);
  if (!locales.length) throw new Error('Manifest has no locale chunks.');
  // Startup loads one language catalogue, so the largest counts.
  const locale = [...filesOf(manifest, locales)].reduce((best, file) => (size(file) > size(best) ? file : best));
  const shell = withClosure(manifest, [entryKey]);
  const activity = union(shell, withClosure(manifest, [activityKey, ...chartKeys]));
  const login = union(shell, withClosure(manifest, [loginKey]));
  const result = [
    entry('startupLogin', 'login', union(login, [locale]), '.js', size),
    entry('startupActivity', 'activity', union(activity, [locale]), '.js', size),
    entry('startupCss', 'activity', activity, '.css', size),
    // The mock loads on top of the shell, so only what it adds counts.
    entry(
      'mock',
      mockKey,
      [...withClosure(manifest, [mockKey])].filter(file => !activity.has(file)),
      '.js',
      size
    )
  ];
  for (const [key, chunk] of entries) {
    if (/^src\/fonts-.*\.css$/.test(chunk.src ?? '')) result.push(entry('fontCss', key, [chunk.file], '.css', size));
  }
  for (const key of locales) result.push(entry('locale', key, [manifest[key].file], '.js', size));
  for (const [key, chunk] of entries) {
    if (!chunk.isDynamicEntry || !key.startsWith('src/features/')) continue;
    const own = [...withClosure(manifest, [key])].filter(file => !activity.has(file));
    result.push(entry(key === configKey ? 'routeConfig' : 'route', key, own, '.js', size));
  }
  if (!result.some(({budget}) => budget === 'routeConfig')) throw new Error(`Manifest has no ${configKey}.`);
  return result;
}

export function checkLimits(limits) {
  for (const name of budgetNames) {
    if (!Number.isSafeInteger(limits?.[name]) || limits[name] <= 0) throw new Error(`Invalid sizeBudget.${name}`);
  }
  const unknown = Object.keys(limits).filter(name => !budgetNames.includes(name));
  if (unknown.length) throw new Error(`Unknown sizeBudget keys: ${unknown.join(', ')}`);
}

// One result per budget: the worst entry, with its limit and whether it passes.
export function evaluate(entries, limits) {
  return budgetNames.map(name => {
    const worst = entries.filter(({budget}) => budget === name).reduce((a, b) => (b.bytes > a.bytes ? b : a));
    return {name, limit: limits[name], ok: worst.bytes <= limits[name], worst};
  });
}

export function report({name, limit, ok, worst}, contributors = 5) {
  const line = `${ok ? 'ok  ' : 'FAIL'} ${name}: ${worst.bytes} bytes gzip / ${limit} limit (${worst.label})`;
  if (ok) return line;
  const top = worst.parts.slice(0, contributors).map(([file, bytes]) => `    ${file}: ${bytes} bytes gzip`);
  return [`${line}, over by ${worst.bytes - limit}`, '  largest contributors:', ...top].join('\n');
}

// Everything built, for information only; it is not a budget.
export function totals(sizes) {
  const result = {};
  for (const ext of ['js', 'css']) {
    const files = [...sizes].filter(([file]) => file.endsWith(`.${ext}`));
    const language = Math.max(0, ...files.filter(([file]) => file.startsWith('assets/locale-')).map(([, bytes]) => bytes));
    result[ext] = files.filter(([file]) => !file.startsWith('assets/locale-')).reduce((sum, [, bytes]) => sum + bytes, language);
  }
  return result;
}
