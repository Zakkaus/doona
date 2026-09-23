import ts from 'typescript';
import {readFileSync, readdirSync} from 'node:fs';

const languages = ['zh-TW', 'zh-CN', 'en'];
const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const excluded = /(?:^src\/i18n\/|\/messages\.ts$|^src\/api\/mock\/|^src\/api\/types\.ts$|^src\/features\/policies\/geo\.ts$|^src\/dae\/templates\.ts$)/;
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
// The generated per-language modules hold every key as a literal, so they are neither sources nor usages.
const generated = /^src\/i18n\/locales\//;
const sources = files('src').filter(path => /\.(?:ts|tsx)$/.test(path));
const references = new Set();
const literal = new Set(['doona', 'must']);
let cjkCount = 0;
const failures = [];
for (const path of sources.filter(path => !path.endsWith('/messages.ts') && !generated.test(path))) {
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

const authored = /^src\/(?:shell|ui|features\/[^/]+|features\/[^/]+\/[^/]+)\/messages\.ts$/;
function generatedKeys(lang) {
  const path = `src/i18n/locales/${lang}.ts`;
  let found;
  visit(parse(path), node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'messages') {
      const value = ts.isSatisfiesExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (ts.isObjectLiteralExpression(value)) found = value.properties.map(entry => entry.name.text).sort();
    }
  });
  if (!found) throw new Error(`${path}: expected an exported messages object`);
  return found;
}
const keys = new Set();
let mismatches = 0;
for (const path of sources.filter(path => path.endsWith('/messages.ts'))) {
  let catalog;
  const ast = parse(path);
  visit(ast, node => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'messages' &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText(ast) === 'defineMessages'
    ) {
      catalog = node.initializer.arguments[0];
    }
  });
  if (!catalog || !ts.isObjectLiteralExpression(catalog)) throw new Error(`${path}: expected defineMessages with literal language tables`);
  const sets = new Map();
  for (const property of catalog.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isObjectLiteralExpression(property.initializer)) throw new Error(`${path}: expected a language table`);
    sets.set(property.name.text, property.initializer.properties.map(entry => entry.name.text).sort());
  }
  const expected = sets.get('zh-TW');
  if (sets.size !== languages.length || !expected || languages.some(lang => JSON.stringify(sets.get(lang)) !== JSON.stringify(expected))) {
    failures.push(`${path}: language key sets differ`);
    mismatches++;
  }
  if (!authored.test(path)) failures.push(`${path}: not read by tools/gen-locales.mjs`);
  else for (const key of expected ?? []) keys.add(key);
  console.log(`${path}: ${expected?.length ?? 0} keys`);
}
const all = JSON.stringify([...keys].sort());
for (const lang of languages)
  if (JSON.stringify(generatedKeys(lang)) !== all) failures.push(`src/i18n/locales/${lang}.ts: keys differ from the messages.ts sources; run pnpm gen:locales`);
const unused = [...keys].filter(key => !references.has(key));
for (const key of unused) failures.push(`Unused message key: ${key}`);
console.log(`i18n: ${cjkCount} CJK literals, ${unused.length} unused keys, ${mismatches} language key-set mismatches`);
for (const failure of failures) console.error(failure);
process.exitCode = failures.length ? 1 : 0;
