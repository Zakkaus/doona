import ts from 'typescript';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {checkCatalogues, missingLanguage, readCatalogues} from './catalogues.mjs';
import {languages, REFERENCE_LANG} from './languages.mjs';

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

const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const excluded = /(?:^src\/i18n\/|^src\/api\/mock\/|^src\/api\/types\.ts$|^src\/features\/shared\/geo\.ts$|^src\/dae\/templates\.ts$)/;
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
const literal = new Set(['doona', 'must']);
let cjkCount = 0;
const failures = [];
for (const path of sources) {
  const ast = parse(path);
  const test = /\.test\.tsx?$/.test(path);
  visit(ast, node => {
    // A key that only a test names is unused in the application.
    if (ts.isStringLiteralLike(node) && !test) references.add(node.text);
    if (
      !excluded.test(path) &&
      (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) &&
      cjk.test(node.text)
    ) {
      const {line} = ast.getLineAndCharacterOfPosition(node.getStart(ast));
      failures.push(`${path}:${line + 1}: CJK literal: ${node.text.trim()}`);
      cjkCount++;
    }
    // Visible or announced English written straight into markup bypasses the catalogue just as CJK would.
    // Placeholders are sample input, and the product name and dae keywords are not language.
    const spoken =
      (ts.isJsxText(node) && /[A-Za-z]{2,}/.test(node.text) && !literal.has(node.text.trim())) ||
      (ts.isJsxAttribute(node) &&
        /^(?:aria-label|aria-description|title|label|alt)$/.test(node.name.getText(ast)) &&
        node.initializer &&
        ts.isStringLiteral(node.initializer) &&
        /[A-Za-z]{2,}/.test(node.initializer.text));
    if (!excluded.test(path) && !test && spoken) {
      const {line} = ast.getLineAndCharacterOfPosition(node.getStart(ast));
      failures.push(`${path}:${line + 1}: untranslated markup text: ${node.getText(ast).trim()}`);
    }
  });
}

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
const checked = checkCatalogues(catalogues, REFERENCE_LANG, new Set(languages.filter(language => language.complete).map(language => language.id)));
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
console.log(`i18n: ${cjkCount} CJK literals, ${unused.length} unused keys`);
for (const failure of failures) console.error(failure);
process.exitCode = failures.length ? 1 : 0;
