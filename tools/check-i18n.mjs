import ts from 'typescript';
import {readFileSync, readdirSync} from 'node:fs';
import {checkCatalogues} from './catalogues.mjs';
import {REFERENCE_LANG, langs as languages} from './languages.mjs';

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
const catalogues = Object.fromEntries(languages.map(lang => [lang, JSON.parse(readFileSync(`src/i18n/locales/${lang}.json`, 'utf8'))]));
failures.push(...checkCatalogues(catalogues, REFERENCE_LANG));
const unused = Object.keys(catalogues[REFERENCE_LANG]).filter(key => !references.has(key));
for (const key of unused) failures.push(`Unused message key: ${key}`);
console.log(`i18n: ${cjkCount} CJK literals, ${unused.length} unused keys`);
for (const failure of failures) console.error(failure);
process.exitCode = failures.length ? 1 : 0;
