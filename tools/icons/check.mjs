#!/usr/bin/env node
// Validates src/ui/brands.json: every entry is well formed, its source exists in the pack listing under
// tools/icons/lists, geosite names exist upstream, and no domain, geosite, keyword or address is claimed twice.
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const packs = JSON.parse(readFileSync(join(here, 'packs.json'), 'utf8'));
const list = name =>
  new Set(
    readFileSync(join(here, 'lists', name + '.txt'), 'utf8')
      .split('\n')
      .filter(Boolean)
  );
const geosites = list('geosites');
const files = Object.fromEntries(Object.keys(packs).map(pack => [pack, list(pack)]));
const brands = JSON.parse(readFileSync(join(root, 'src', 'ui', 'brands.json'), 'utf8'));

const errors = [];
const seen = {id: new Map(), geosite: new Map(), domain: new Map(), keyword: new Map(), address: new Map(), policy: new Map()};
const claim = (kind, value, id) => {
  const owner = seen[kind].get(value);
  if (owner && owner !== id) errors.push(`${kind} "${value}" claimed by both ${owner} and ${id}`);
  seen[kind].set(value, id);
};
const idPattern = /^[a-z0-9][a-z0-9-]*$/;
const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
const v4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const v6 = /^[0-9a-f:]+$/;
if (!Array.isArray(brands)) errors.push('brands.json must be an array');
for (const brand of Array.isArray(brands) ? brands : []) {
  const id = brand.id;
  const where = `entry ${JSON.stringify(id)}`;
  if (typeof id !== 'string' || !idPattern.test(id)) errors.push(`${where}: id must be lower-case kebab`);
  else claim('id', id, id);
  if (typeof brand.label !== 'string' || !brand.label.trim()) errors.push(`${where}: label required`);
  const source = typeof brand.source === 'string' ? brand.source.split('/') : [];
  const [pack, ...rest] = source;
  const file = rest.join('/');
  // "favicon/<host>" takes the site's own icon (see fetch.py); every other source names a file in a pack.
  if (pack === 'favicon') {
    if (!domainPattern.test(file)) errors.push(`${where}: favicon source "${file}" is not a hostname`);
  } else if (!packs[pack]) errors.push(`${where}: unknown pack in source "${brand.source}"`);
  else if (!files[pack].has(file)) errors.push(`${where}: "${file}" is not in ${pack}`);
  const known = new Set(['id', 'label', 'source', 'geosite', 'domain', 'keyword', 'address', 'policy']);
  for (const key of Object.keys(brand)) if (!known.has(key)) errors.push(`${where}: unknown field "${key}"`);
  for (const kind of ['geosite', 'domain', 'keyword', 'address', 'policy']) {
    const values = brand[kind] ?? [];
    if (!Array.isArray(values) || values.some(value => typeof value !== 'string')) {
      errors.push(`${where}: ${kind} must be a string array`);
      continue;
    }
    for (const value of values) {
      if (value !== value.toLowerCase().trim()) errors.push(`${where}: ${kind} "${value}" must be lower-case and trimmed`);
      if (kind === 'geosite' && !geosites.has(value)) errors.push(`${where}: geosite "${value}" is not in v2fly data`);
      if (kind === 'domain' && !domainPattern.test(value)) errors.push(`${where}: domain "${value}" is not a hostname`);
      if (kind === 'keyword' && !/^[a-z0-9.-]{3,}$/.test(value)) errors.push(`${where}: keyword "${value}" must be 3+ chars of [a-z0-9.-]`);
      if (kind === 'address' && !v4.test(value) && !v6.test(value)) errors.push(`${where}: address "${value}" is not an IP`);
      claim(kind, value, id);
    }
  }
  if (!(brand.geosite?.length || brand.domain?.length || brand.keyword?.length || brand.address?.length || brand.policy?.length))
    errors.push(`${where}: matches nothing`);
}
// With --icons, public/brands must hold exactly the catalogue: run tools/icons/fetch.py after editing brands.json.
if (process.argv.includes('--icons')) {
  const iconDir = join(root, 'public', 'brands');
  const present = new Set(existsSync(iconDir) ? readdirSync(iconDir) : []);
  for (const id of seen.id.keys()) if (!present.has(id + '.png')) errors.push(`public/brands/${id}.png is missing (run tools/icons/fetch.py)`);
  for (const file of present) if (!seen.id.has(file.replace(/\.png$/, ''))) errors.push(`public/brands/${file} is not in the catalogue`);
}
// A keyword that is also the first label of a claimed domain is redundant unless it belongs to the same brand.
for (const [keyword, id] of seen.keyword) {
  for (const [domain, owner] of seen.domain) {
    if (owner !== id && domain.split('.').includes(keyword)) errors.push(`keyword "${keyword}" (${id}) also matches ${owner}'s ${domain}`);
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} problem(s) in ${brands.length ?? 0} entries`);
  process.exit(1);
}
console.log(
  `brands.json ok: ${brands.length} entries, ${seen.geosite.size} geosites, ${seen.domain.size} domains, ${seen.keyword.size} keywords, ${seen.address.size} addresses`
);
