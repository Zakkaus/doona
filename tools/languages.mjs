// The language list for the Node tools, read from src/i18n/languages.ts with the TypeScript compiler, never evaluated,
// so the tools and the app share one list.
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const file = 'src/i18n/languages.ts';
const source = ts.createSourceFile(file, readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const literal = node => {
  while (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) node = node.expression;
  if (ts.isStringLiteral(node)) return node.text;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(property => [property.name.text, literal(property.initializer)]));
  throw new Error(`${file}: ${node.getText(source)} is not a plain literal`);
};
const constants = {};
for (const statement of source.statements)
  if (ts.isVariableStatement(statement))
    for (const declaration of statement.declarationList.declarations)
      if (ts.isIdentifier(declaration.name) && declaration.initializer) constants[declaration.name.text] = declaration.initializer;

/** @type {Array<{id: string, name: string, locale: string, docs: string, fonts: string | null}>} */
export const languages = literal(constants.languages);
export const REFERENCE_LANG = literal(constants.REFERENCE_LANG);
export const langs = languages.map(language => language.id);
