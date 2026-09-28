// The rules every catalogue in src/i18n/locales follows, kept apart from the file reading so a test can feed it
// made-up languages. English is the reference: another catalogue may hold only its keys, with the same placeholders,
// and a complete language must hold all of them.
// A blank message would show nothing where the reader expects text, so every string must hold some.
const text = value => typeof value === 'string' && value.trim() !== '';
const valid = message =>
  text(message) ||
  (typeof message === 'object' && message !== null && Object.keys(message).sort().join() === 'one,other' && text(message.one) && text(message.other));
// The placeholders a message fills, from every string in it (a plural's forms included).
const placeholders = message =>
  [...new Set((typeof message === 'string' ? [message] : Object.values(message)).flatMap(text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1])))]
    .sort()
    .join(',');

/**
 * @param {Record<string, Record<string, unknown>>} catalogues each language's parsed catalogue, by id
 * @param {string} reference the id of the reference catalogue
 * @param {ReadonlySet<string>} complete the ids of the languages that must hold every key
 * @returns {{failures: string[], missing: Record<string, string[]>}} what breaks a rule, and each language's absent keys
 */
export function checkCatalogues(catalogues, reference, complete) {
  const failures = [];
  const missing = {};
  const expected = catalogues[reference];
  for (const [lang, catalogue] of Object.entries(catalogues)) {
    const file = `src/i18n/locales/${lang}.json`;
    const keys = Object.keys(catalogue);
    if (keys.join('\n') !== [...keys].sort().join('\n')) failures.push(`${file}: keys are not sorted`);
    for (const key of keys) {
      const message = catalogue[key];
      if (!valid(message)) failures.push(`${file}: ${key} must be a non-empty string or {"one", "other"} non-empty strings`);
      else if (!Object.hasOwn(expected, key)) failures.push(`${file}: ${key} is not in ${reference}.json`);
      else if (valid(expected[key]) && placeholders(message) !== placeholders(expected[key]))
        failures.push(`${file}: ${key} placeholders {${placeholders(message)}} differ from ${reference}'s {${placeholders(expected[key])}}`);
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
    if (source !== undefined) catalogues[id] = JSON.parse(source);
    else if (complete) failures.push(`${file} does not exist, and ${id} is marked complete in src/i18n/languages.ts`);
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
