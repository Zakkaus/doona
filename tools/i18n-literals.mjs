// Interface text written straight into the source instead of taken from a catalogue: CJK in any string, and English
// where the page shows it, in JSX text and children, visible attributes, and toast messages.
import ts from 'typescript';

const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const words = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[A-Za-z]{2,}/u;
// HTML and ARIA attributes the page shows or announces, then the props doona's components render as text.
const visibleAttributes = new Set([
  ...['aria-label', 'aria-description', 'title', 'placeholder', 'alt', 'label'],
  ...['confirmLabel', 'description', 'empty', 'note', 'text', 'textValue', 'tip']
]);
// Files whose strings are data rather than doona's own text.
const dataFiles = new Map([
  ['src/i18n/languages.ts', 'each language named in itself'],
  ['src/dae/regions.ts', 'shared region names and node-name detection aliases'],
  ['src/dae/templates.ts', 'generated routing comments and bilingual node-name match patterns'],
  ['src/api/mock/fixtures/configuration.ts', 'demo backend data, as honk would send it'],
  ['src/api/mock/fixtures/inventory.ts', 'demo backend data, as honk would send it']
]);
// Literals that read as words but are names, keywords or sample input, each in the one file and place it may appear:
// JSX text, or the attribute it fills.
const allowed = new Map(
  [
    ['src/main.tsx', 'text', 'doona', 'product name'],
    ['src/features/rules/RuleList.tsx', 'text', 'must', 'dae keyword'],
    ['src/features/config/NewSource.tsx', 'placeholder', 'extra', 'sample source name'],
    ['src/features/config/NewSource.tsx', 'placeholder', 'config.d/extra.dae', 'sample source path'],
    ['src/features/shared/IncludesEditor.tsx', 'placeholder', "name(keyword: 'HK')", 'sample dae condition'],
    ['src/features/dns/Dns.tsx', 'placeholder', 'example.com', 'sample domain'],
    ['src/features/rules/Rules.tsx', 'placeholder', 'example.com', 'sample domain'],
    ['src/features/shared/SubscriptionFields.tsx', 'placeholder', 'https://example.org/sub?token=…', 'sample subscription URL'],
    ['src/features/nodes/Nodes.tsx', 'placeholder', 'vless://…', 'sample share link'],
    ['src/features/shared/SubscriptionFields.tsx', 'placeholder', 'sub-a', 'sample subscription name'],
    ['src/features/nodes/Nodes.tsx', 'placeholder', 'hk', 'sample node name'],
    ['src/features/nodes/Nodes.tsx', 'placeholder', 'hk-03', 'sample node name']
  ].map(([path, place, text, reason]) => [`${path} ${place} ${text}`, reason])
);

const textOf = node => (ts.isTemplateExpression(node) ? node.head.text + node.templateSpans.map(span => '${}' + span.literal.text).join('') : node.text).trim();
// The literal strings an expression shows: itself, either branch of a conditional or logical operator, or the parts of a
// concatenation.
function leaves(node) {
  if (ts.isParenthesizedExpression(node)) return leaves(node.expression);
  if (ts.isConditionalExpression(node)) return [...leaves(node.whenTrue), ...leaves(node.whenFalse)];
  if (
    ts.isBinaryExpression(node) &&
    [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.PlusToken].includes(node.operatorToken.kind)
  )
    return [...leaves(node.left), ...leaves(node.right)];
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return leaves(node.right);
  return ts.isStringLiteralLike(node) || ts.isTemplateExpression(node) ? [node] : [];
}

export function scanLiterals(path, ast) {
  if (/\.test\.tsx?$/.test(path) || dataFiles.has(path)) return [];
  const failures = [];
  const reported = new Set();
  const report = (node, pattern, place) => {
    const text = textOf(node);
    if (!pattern.test(text) || allowed.has(`${path} ${place} ${text}`) || reported.has(node)) return;
    reported.add(node);
    const {line} = ast.getLineAndCharacterOfPosition(node.getStart(ast));
    failures.push(`${path}:${line + 1}: untranslated text: ${text}`);
  };
  const shown = (node, place) => node && leaves(node).forEach(leaf => report(leaf, words, place));
  (function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) report(node, cjk, 'string');
    else if (ts.isJsxText(node)) report(node, words, 'text');
    if (ts.isJsxAttribute(node) && visibleAttributes.has(node.name.getText(ast)))
      shown(node.initializer && ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer, node.name.getText(ast));
    if (ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent)) shown(node.expression, 'text');
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'toast') shown(node.arguments[1], 'toast');
    ts.forEachChild(node, visit);
  })(ast);
  return failures;
}
