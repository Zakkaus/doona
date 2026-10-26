import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const root = path.resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
const spacing = new Set([0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10]);
const spacingTokens = new Set(['0', '0-5', '1-5', ...Array.from({length: 12}, (_, i) => String(i + 1))]);
const errors = [];
const rawColor = /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(|(?:^|[\s,(])(?:white|black)(?=$|[\s,)])/i;
function files(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => (entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
}
function tag(node) {
  return node.tagName?.getText() ?? '';
}
function opening(node) {
  return ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
}
function attr(node, name) {
  return node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText() === name)?.initializer;
}
function literal(node) {
  if (!node) return undefined;
  if (ts.isJsxExpression(node)) return literal(node.expression);
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
}
function insideRows(node) {
  for (let p = node.parent; p; p = p.parent) if (ts.isJsxElement(p) && tag(p.openingElement) === 'RowEntrance') return true;
  return false;
}
let checked = 0;
for (const file of files(path.join(root, 'src')).filter(f => /\.(tsx?|css)$/.test(f))) {
  const relative = path.relative(root, file).replaceAll(path.sep, '/');
  const source = fs.readFileSync(file, 'utf8');
  const fail = (rule, node, message) => {
    const line = node ? ast.getLineAndCharacterOfPosition(node.getStart()).line + 1 : 1;
    errors.push(`${relative}:${line} [${rule}] ${message}`);
  };
  for (const match of source.matchAll(/(?:from\s+|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/g)) {
    const imported = match[1];
    if (
      /heroicons|lucide|(?:^|\/)icons?(?:[\/.-]|$)/i.test(imported) &&
      !imported.startsWith('@astryxdesign/core/') &&
      !(relative === 'src/themes/shared/index.ts' && imported === './icons') &&
      !(
        path.resolve(path.dirname(file), imported) === path.join(root, 'src/ui/icons') ||
        path.resolve(path.dirname(file), imported).startsWith(path.join(root, 'src/ui/icons') + path.sep)
      )
    )
      errors.push(`${relative} [icon-import] Icons must come from lite src/ui/icons`);
  }
  // Theme files define the token values. Icon/brand SVG coordinates are artwork, not layout.
  if (relative.startsWith('src/themes/')) continue;
  checked++;
  if (file.endsWith('.css')) {
    const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
    if (rawColor.test(css)) fail('colors', null, 'Colours must use theme tokens');
    if (/\b\d+(?:\.\d+)?px\b/.test(css)) fail('tokens', null, 'CSS lengths must use tokens');
    if (/(?:padding[\w-]*|margin[\w-]*|gap|row-gap|column-gap|border-radius|font-size)\s*:[^;{}]*\b\d+(?:\.\d+)?(?:rem|em|vh|vw|%)\b/.test(css))
      fail('tokens', null, 'CSS spacing must use tokens');
    continue;
  }
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let page = false;
  let readyHook = false;
  function visit(node) {
    const open = opening(node);
    if (open) {
      const name = tag(open);
      if (['div', 'span'].includes(name)) fail('layout', open, 'Use Astryx layout/Text components');
      if (name === 'Heading' && literal(attr(open, 'level')) === 1) page = true;
      const list =
        ['Table', 'List', 'RadioList'].includes(name) ||
        ['ul', 'ol'].includes(literal(attr(open, 'as'))) ||
        ['list', 'listbox', 'radiogroup'].includes(literal(attr(open, 'role')));
      if (list && !insideRows(node)) fail('rows', open, 'Table/list requires a RowEntrance ancestor');
      if (name === 'Grid' && attr(open, 'columns')?.getText().includes('minWidth') && literal(attr(open, 'role')) !== 'radiogroup')
        fail('grid', open, 'No auto-fill page columns');
      for (const p of open.attributes.properties) {
        if (!ts.isJsxAttribute(p)) continue;
        if (name === 'NumberInput' && ['hasClear', 'hasNumberSteppers'].includes(p.name.getText()))
          fail('number-input', p, 'NumberInput uses keyboard stepping, without clear or stepper buttons');
        if (/^(gap|rowGap|columnGap|padding.*|margin.*)$/.test(p.name.getText())) {
          const value = literal(p.initializer);
          if (typeof value === 'number' && !spacing.has(value)) fail('spacing', p, 'Use the Astryx spacing scale');
          if (typeof value === 'string' && value !== 'auto' && !value.includes('var(--spacing-')) fail('spacing', p, 'Use a spacing token');
        }
      }
    }
    if (ts.isCallExpression(node) && node.expression.getText() === 'usePageMotion' && node.arguments[0]?.getText() === 'ready') readyHook = true;
    if (ts.isStringLiteralLike(node)) {
      if (rawColor.test(node.text)) fail('colors', node, 'Colours must use theme tokens');
      for (const match of node.text.matchAll(/var\(--spacing-([\d-]+)\)/g))
        if (!spacingTokens.has(match[1])) fail('tokens', node, `Unknown spacing token: --spacing-${match[1]}`);
    }
    if (ts.isStringLiteralLike(node) && /\b\d+(?:\.\d+)?px\b/.test(node.text)) {
      const mediaKey = ts.isPropertyAssignment(node.parent) && node.parent.name === node && /^@(media|container) /.test(node.text);
      if (!mediaKey && relative !== 'src/ui/metrics.stylex.ts') fail('tokens', node, 'Raw px outside geometry tokens');
    }
    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText().replaceAll(/["']/g, '');
      const value = literal(node.initializer);
      if (/^(padding.*|margin.*|gap|rowGap|columnGap|borderRadius|fontSize)$/.test(name)) {
        if (typeof value === 'number' && value !== 0) fail('tokens', node, 'Style values must use tokens, not raw numbers');
        if (typeof value === 'string' && !['0', 'auto', 'inherit', 'initial', 'unset'].includes(value) && !value.includes('var(--'))
          fail('tokens', node, 'Style spacing must use tokens');
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (page && !readyHook) fail('ready', null, 'Page requires usePageMotion(ready)');
}
const shell = fs.readFileSync(path.join(root, 'src/Shell.tsx'), 'utf8');
const icons = [...shell.matchAll(/\{id: ['"][^'"]+['"], icon: (\w+)\}/g)].map(m => m[1]);
if (icons.length !== 5 || new Set([...icons, 'Settings']).size !== 6)
  errors.push('src/Shell.tsx [icons] Five distinct nav icons, separate from Settings, are required');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log(`UI checks passed (${checked} source files; layout, spacing, tokens, grid, icons, ready, rows, number-input)`);
