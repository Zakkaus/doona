// The rules every catalogue in src/i18n/locales follows, kept apart from the file reading so a test can feed it
// made-up languages. English is the reference: another catalogue may hold only its keys, with the same placeholders,
// and a complete language must hold all of them.
// A blank message would show nothing where the reader expects text, so every string must hold some.
const text = value => typeof value === 'string' && value.trim() !== '';
const valid = (message, categories) =>
  text(message) ||
  (typeof message === 'object' &&
    message !== null &&
    !Array.isArray(message) &&
    Object.hasOwn(message, 'other') &&
    Object.keys(message).every(category => categories.includes(category) && text(message[category])));
// A locale's plural forms in CLDR order; the order Intl reports differs between ICU versions.
const cldrOrder = ['zero', 'one', 'two', 'few', 'many', 'other'];
const pluralCategories = locale => {
  const reported = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
  return cldrOrder.filter(category => reported.includes(category));
};
const placeholders = text => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]))].sort().join(',');
// The arguments a CodeMirror phrase (a cm.* key) fills, read as EditorState.phrase reads them: `$` is `$1`, `$$` is a
// literal `$`, and `$0` fills nothing.
const substitutions = text =>
  [
    ...new Set(
      [...text.matchAll(/\$(\$|\d*)/g)]
        .map(match => (match[1] === '$' ? 0 : +(match[1] || 1)))
        .filter(Boolean)
        .map(n => `$${n}`)
    )
  ]
    .sort()
    .join(',');
// A message's forms by name; a plain string is the general form, `other`.
const forms = message => (typeof message === 'string' ? {other: message} : message);
// A key names its area first, `area.name`, the way the other keys do; a bare key such as `close` has no area.
export const areaPrefixFailures = keys => keys.filter(key => !/^\w+\.\w/.test(key)).map(key => `Message key has no area prefix: ${key}`);
// Each form of a message against the reference's form of the same name, else its general form, so a plural form that
// drops a placeholder is caught even when another form keeps it.
function placeholderFailures(file, key, message, expected, reference) {
  const wanted = forms(expected);
  const kinds = key.startsWith('cm.') ? {placeholders, 'CodeMirror arguments': substitutions} : {placeholders};
  return Object.entries(forms(message)).flatMap(([form, text]) =>
    Object.entries(kinds).flatMap(([kind, read]) => {
      const have = read(text),
        want = read(wanted[form] ?? wanted.other);
      const name = typeof message === 'string' ? key : `${key} (${form})`;
      return have === want ? [] : [`${file}: ${name} ${kind} {${have}} differ from ${reference}'s {${want}}`];
    })
  );
}
// The keys an object in JSON text repeats, which JSON.parse would silently resolve to the last value.
function duplicateKeys(source) {
  const objects = [];
  const repeated = [];
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '{') objects.push(new Set());
    else if (c === '}') objects.pop();
    else if (c === '"') {
      let end = i + 1;
      while (source[end] !== '"') end += source[end] === '\\' ? 2 : 1;
      const key = JSON.parse(source.slice(i, end + 1));
      i = end;
      // A string followed by a colon is a key of the innermost object.
      if (/^\s*:/.test(source.slice(end + 1, end + 16))) {
        if (objects.at(-1).has(key)) repeated.push(key);
        objects.at(-1).add(key);
      }
    }
  }
  return repeated;
}

/**
 * @param {Record<string, Record<string, unknown>>} catalogues each language's parsed catalogue, by id
 * @param {string} reference the id of the reference catalogue
 * @param {ReadonlySet<string>} complete the ids of the languages that must hold every key
 * @param {Record<string, string>} locales each language's Intl locale, by id
 * @returns {{failures: string[], missing: Record<string, string[]>}} what breaks a rule, and each language's absent keys
 */
export function checkCatalogues(catalogues, reference, complete, locales) {
  const failures = [];
  const missing = {};
  const expected = catalogues[reference];
  const referenceCategories = pluralCategories(locales[reference]);
  for (const [lang, catalogue] of Object.entries(catalogues)) {
    const file = `src/i18n/locales/${lang}.json`;
    const categories = pluralCategories(locales[lang]);
    const keys = Object.keys(catalogue);
    if (keys.join('\n') !== [...keys].sort().join('\n')) failures.push(`${file}: keys are not sorted`);
    for (const key of keys) {
      const message = catalogue[key];
      if (!valid(message, categories))
        failures.push(`${file}: ${key} must be a non-empty string or a plural object with "other" and only ${categories.join(', ')} forms`);
      else if (!Object.hasOwn(expected, key)) failures.push(`${file}: ${key} is not in ${reference}.json`);
      else if (valid(expected[key], referenceCategories)) failures.push(...placeholderFailures(file, key, message, expected[key], reference));
    }
    missing[lang] = Object.keys(expected).filter(key => !Object.hasOwn(catalogue, key));
    if (complete.has(lang)) for (const key of missing[lang]) failures.push(`${file}: ${key} is missing`);
  }
  return {failures, missing};
}

/**
 * Reads every language's catalogue. An absent file is a failure naming it, except for the partial language `pending`,
 * which `check:i18n --missing` may be asked about before its catalogue exists, and which counts as empty. A complete
 * language without a catalogue is left out of the result, so its absence is reported once rather than key by key.
 * @param {ReadonlyArray<{id: string, complete: boolean}>} languages the registry
 * @param {(file: string) => string | undefined} read a file's text, or undefined when it does not exist
 * @param {string} [pending] the language `--missing` names
 * @returns {{catalogues: Record<string, Record<string, unknown>>, failures: string[]}}
 */
export function readCatalogues(languages, read, pending) {
  const catalogues = {};
  const failures = [];
  for (const {id, complete} of languages) {
    const file = `src/i18n/locales/${id}.json`;
    const source = read(file);
    if (source !== undefined) {
      catalogues[id] = JSON.parse(source);
      for (const key of duplicateKeys(source)) failures.push(`${file}: ${key} is written more than once`);
    } else if (complete) failures.push(`${file} does not exist, and ${id} is marked complete in src/i18n/languages.ts`);
    else {
      catalogues[id] = {};
      if (id !== pending) failures.push(`${file} does not exist; create it, starting from {}`);
    }
  }
  return {catalogues, failures};
}

/**
 * The language `--missing <id>` names, or undefined without the flag.
 * @param {readonly string[]} args the command-line arguments
 * @param {readonly string[]} ids the registry's language ids
 * @returns {string | undefined}
 * @throws {Error} a usage message when the id is absent or not in the registry
 */
export function missingLanguage(args, ids) {
  const at = args.indexOf('--missing');
  if (at === -1) return undefined;
  const id = args[at + 1];
  if (id !== undefined && ids.includes(id)) return id;
  throw new Error(
    `${id === undefined ? '--missing needs a language id' : `--missing: no language ${id} in src/i18n/languages.ts`}\n` +
      `usage: pnpm check:i18n [--missing <id>], where <id> is one of ${ids.join(', ')}`
  );
}
