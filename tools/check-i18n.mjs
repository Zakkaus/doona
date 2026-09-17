import ts from 'typescript';
import {readFileSync, readdirSync} from 'node:fs';
import {dirname, resolve, relative} from 'node:path';

const languages = ['zh-TW', 'zh-CN', 'en'];
const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const excluded = /(?:^src\/i18n\/|\/messages\.ts$|^src\/api\/mock\/|^src\/api\/types\.ts$|^src\/features\/policies\/geo\.ts$)/;
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
let cjkCount = 0;
const failures = [];
for (const path of sources.filter(path => !path.endsWith('/messages.ts'))) {
  const ast = parse(path);
  visit(ast, node => {
    if (ts.isStringLiteralLike(node)) references.add(node.text);
    if (
      !excluded.test(path) &&
      (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) &&
      cjk.test(node.text)
    ) {
      const {line} = ast.getLineAndCharacterOfPosition(node.getStart(ast));
      failures.push(`${path}:${line + 1}: CJK literal: ${node.text.trim()}`);
      cjkCount++;
    }
  });
}

const merger = parse('src/i18n/messages.ts');
const imports = new Map();
let mergedNames = [];
visit(merger, node => {
  if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
    for (const specifier of node.importClause.namedBindings.elements) {
      if ((specifier.propertyName ?? specifier.name).text === 'messages') {
        imports.set(specifier.name.text, relative(process.cwd(), resolve(dirname(merger.fileName), node.moduleSpecifier.text + '.ts')));
      }
    }
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'modules') {
    const value = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer;
    if (!ts.isArrayLiteralExpression(value)) throw new Error('The merged modules must be a literal array.');
    mergedNames = value.elements.map(element => element.getText(merger));
  }
});
const mergedFiles = new Set(mergedNames.map(name => imports.get(name)));
if (!mergedFiles.size || mergedFiles.has(undefined)) failures.push('src/i18n/messages.ts: cannot resolve the merged message modules');
const keys = new Set();
let mismatches = 0;
for (const path of sources.filter(path => path.endsWith('/messages.ts') && path !== merger.fileName)) {
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
  if (!mergedFiles.has(path)) failures.push(`${path}: message module is not merged`);
  else for (const key of expected ?? []) keys.add(key);
  console.log(`${path}: ${expected?.length ?? 0} keys`);
}
const unused = [...keys].filter(key => !references.has(key));
for (const key of unused) failures.push(`Unused message key: ${key}`);
console.log(`i18n: ${cjkCount} CJK literals, ${unused.length} unused keys, ${mismatches} language key-set mismatches`);
for (const failure of failures) console.error(failure);
process.exitCode = failures.length ? 1 : 0;
