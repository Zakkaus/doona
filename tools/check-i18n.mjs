import ts from 'typescript';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {areaPrefixFailures, checkCatalogues, missingLanguage, readCatalogues} from './catalogues.mjs';
import {languages, REFERENCE_LANG} from './languages.mjs';
import {startupKeys} from './startup-text.mjs';
import {scanLiterals} from './i18n-literals.mjs';

// `--missing <id>` lists what a language still lacks, grouped by the key's first segment, as lines to paste into its
// catalogue with the English text to translate. It works before the language's catalogue exists.
let wanted;
try {
  wanted = missingLanguage(
    process.argv.slice(2),
    languages.map(language => language.id)
  );
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

function files(path) {
  return readdirSync(path, {withFileTypes: true}).flatMap(entry => (entry.isDirectory() ? files(`${path}/${entry.name}`) : [`${path}/${entry.name}`]));
}
function parse(path) {
  return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
}
function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, child => visit(child, callback));
}
const sources = files('src').filter(path => /\.(?:ts|tsx)$/.test(path));
const references = new Set();
for (const key of startupKeys) references.add(key);
const literals = [];
for (const path of sources) {
  const ast = parse(path);
  const test = /\.test\.tsx?$/.test(path);
  visit(ast, node => {
    // A key that only a test names is unused in the application.
    if (ts.isStringLiteralLike(node) && !test) references.add(node.text);
  });
  literals.push(...scanLiterals(path, ast));
}

const failures = [...literals];
// Every key of the reference catalogue must be named somewhere in the application.
const loaded = readCatalogues(languages, file => (existsSync(file) ? readFileSync(file, 'utf8') : undefined), wanted);
failures.push(...loaded.failures);
const {catalogues} = loaded;
// Without the reference catalogue nothing else can be checked.
if (!catalogues[REFERENCE_LANG]) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
const reference = catalogues[REFERENCE_LANG];
failures.push(...areaPrefixFailures(Object.keys(reference)));
const checked = checkCatalogues(
  catalogues,
  REFERENCE_LANG,
  new Set(languages.filter(language => language.complete).map(language => language.id)),
  Object.fromEntries(languages.map(language => [language.id, language.locale]))
);
failures.push(...checked.failures);
const unused = Object.keys(reference).filter(key => !references.has(key));
for (const key of unused) failures.push(`Unused message key: ${key}`);
if (wanted !== undefined && Object.hasOwn(checked.missing, wanted)) {
  let group;
  for (const key of checked.missing[wanted]) {
    if (key.split('.')[0] !== group) console.log(`\n# ${(group = key.split('.')[0])}`);
    console.log(`${JSON.stringify(key)}: ${JSON.stringify(reference[key])},`);
  }
}
const total = Object.keys(reference).length;
for (const {id, complete} of languages)
  if (!complete)
    console.log(`${id}: ${total - checked.missing[id].length} of ${total} keys (${Math.floor(((total - checked.missing[id].length) / total) * 100)}%)`);
console.log(`i18n: ${literals.length} untranslated literals, ${unused.length} unused keys`);
for (const failure of failures) console.error(failure);
process.exitCode = failures.length ? 1 : 0;
