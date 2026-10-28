import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import ts from 'typescript';
import {stages} from '../src/i18n/stages';

// The message catalogues load in stages, so a page downloads only the messages its code can show. A stage starts where
// the code wraps a dynamic import in withCatalogue('<stage>', ...) (src/i18n/index.ts), which loads the stage's part of
// the catalogue with the module. A key belongs to the first stage whose code names it; the source files in
// src/i18n/locales stay whole and are split at build time.
//   core      the entry and everything it imports without a stage: the sign-in page and the startup screens
//   activity  the signed-in frame and the Activity page
//   rest      the other pages, the search dialog and any key no code reaches
const entry = 'src/main.tsx';
// Template-built keys must be available before any of their callers render.
const dynamicStages = {'dns.outcome.': 'activity'};

function files(path) {
  return readdirSync(path, {withFileTypes: true}).flatMap(item => (item.isDirectory() ? files(join(path, item.name)) : [join(path, item.name)]));
}
const extensions = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];
const assetImport = /\.(?:css|svg|webp|png|json|woff2)(?:\?.*)?$/;
function resolveImport(root, from, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(root, dirname(from), specifier);
  for (const extension of extensions) {
    const path = base + extension;
    if (/\.tsx?$/.test(path) && existsSync(path)) return relative(root, path);
  }
  return null;
}
const stageOf = node => {
  // The stage of the closest withCatalogue call around a dynamic import, or null when there is none.
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isCallExpression(parent) && ts.isIdentifier(parent.expression) && parent.expression.text === 'withCatalogue') {
      const [name] = parent.arguments;
      if (!name || !ts.isStringLiteralLike(name) || !stages.includes(name.text))
        throw new Error(`withCatalogue needs a stage literal: ${node.getSourceFile().fileName}`);
      return name.text;
    }
  }
  return null;
};

// Every application module with the keys it names and its imports, each edge marked with the stage that starts there.
export function scanModules(root, keys) {
  const modules = new Map();
  const sources = [...files(join(root, 'src')), ...(existsSync(join(root, 'mock')) ? files(join(root, 'mock')) : [])]
    .map(path => relative(root, path))
    .filter(path => /\.tsx?$/.test(path) && !/\.test\.tsx?$|\.test-env\.ts$|\.d\.ts$/.test(path));
  for (const path of sources) {
    const source = ts.createSourceFile(path, readFileSync(join(root, path), 'utf8'), ts.ScriptTarget.Latest, true);
    const named = new Set();
    const edges = [];
    const visit = node => {
      if (ts.isStringLiteralLike(node) && keys.has(node.text)) named.add(node.text);
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 't' &&
        node.arguments[0] &&
        ts.isTemplateExpression(node.arguments[0])
      ) {
        const prefix = node.arguments[0].head.text;
        if (!Object.hasOwn(dynamicStages, prefix)) throw new Error(`Unmapped dynamic message family ${prefix}: ${path}`);
      }
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        // A type-only import brings no code, and so no message.
        if (!(node.importClause?.isTypeOnly || node.isTypeOnly)) edges.push({to: node.moduleSpecifier.text, stage: null});
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]))
        edges.push({to: node.arguments[0].text, stage: stageOf(node)});
      ts.forEachChild(node, visit);
    };
    visit(source);
    // A relative import that names no source file and no asset would hide the keys behind it.
    const unresolved = edges.filter(({to}) => to.startsWith('.') && !assetImport.test(to) && !resolveImport(root, path, to)).map(({to}) => to);
    modules.set(path, {
      keys: named,
      edges: edges.flatMap(({to, stage}) => {
        const target = resolveImport(root, path, to);
        return target ? [{to: target, stage}] : [];
      }),
      unresolved
    });
  }
  return modules;
}

// The stage of every key: a stage's code is what its starting modules reach without crossing into another stage.
export function assignStages(modules, keys, start = entry) {
  const assigned = new Map();
  const starts = new Map(stages.map(stage => [stage, new Set(stage === 'core' ? [start] : [])]));
  for (const {edges} of modules.values()) for (const {to, stage} of edges) if (stage) starts.get(stage).add(to);
  for (const stage of stages) {
    const seen = new Set();
    const queue = [...starts.get(stage)];
    while (queue.length) {
      const path = queue.pop();
      if (seen.has(path) || !modules.has(path)) continue;
      seen.add(path);
      for (const key of modules.get(path).keys) if (!assigned.has(key)) assigned.set(key, stage);
      for (const {to, stage: next} of modules.get(path).edges) if (!next || next === stage) queue.push(to);
    }
  }
  for (const key of keys) {
    const family = Object.entries(dynamicStages).find(([prefix]) => key.startsWith(prefix));
    const stage = assigned.get(key) ?? stages.at(-1);
    assigned.set(key, family && stages.indexOf(family[1]) < stages.indexOf(stage) ? family[1] : stage);
  }
  return assigned;
}

function catalogueStages(root) {
  const keys = new Set(Object.keys(JSON.parse(readFileSync(join(root, 'src/i18n/locales/en.json'), 'utf8'))));
  return assignStages(scanModules(root, keys), keys);
}

const partId = /\/src\/i18n\/locales\/([^/?]+)\.json\?(?:.*&)?part=(\w+)/;
// The language and stage of a catalogue part's module id, or null for any other module.
export function cataloguePart(id) {
  const match = id && partId.exec(id);
  return match ? {lang: match[1], stage: match[2]} : null;
}

// A build serves each stage's keys under <catalogue>.json?part=<stage>; the dev server and the tests serve the whole
// catalogue as the core part, so they need no scan.
export function cataloguePartsPlugin() {
  let root;
  let split = null;
  return {
    name: 'catalogue-parts',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
      if (config.command === 'build') split = true;
    },
    buildStart() {
      if (split) split = catalogueStages(root);
    },
    load(id) {
      const part = cataloguePart(id);
      if (!part) return null;
      if (!stages.includes(part.stage)) throw new Error(`Unknown catalogue stage: ${id}`);
      const file = join(root, 'src/i18n/locales', `${part.lang}.json`);
      this.addWatchFile(file);
      const messages = JSON.parse(readFileSync(file, 'utf8'));
      const own = split
        ? Object.entries(messages).filter(([key]) => (split.get(key) ?? stages.at(-1)) === part.stage)
        : part.stage === 'core'
          ? Object.entries(messages)
          : [];
      return JSON.stringify(Object.fromEntries(own));
    }
  };
}
