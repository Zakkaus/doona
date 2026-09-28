// The rules every catalogue in src/i18n/locales follows, kept apart from the file reading so a test can feed it
// made-up languages. English is the reference: another catalogue may hold only its keys, with the same placeholders,
// and a complete language must hold all of them.
const valid = message =>
  typeof message === 'string' ||
  (typeof message === 'object' &&
    message !== null &&
    Object.keys(message).sort().join() === 'one,other' &&
    typeof message.one === 'string' &&
    typeof message.other === 'string');
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
      if (!valid(message)) failures.push(`${file}: ${key} must be a string or {"one", "other"} strings`);
      else if (!Object.hasOwn(expected, key)) failures.push(`${file}: ${key} is not in ${reference}.json`);
      else if (valid(expected[key]) && placeholders(message) !== placeholders(expected[key]))
        failures.push(`${file}: ${key} placeholders {${placeholders(message)}} differ from ${reference}'s {${placeholders(expected[key])}}`);
    }
    missing[lang] = Object.keys(expected).filter(key => !Object.hasOwn(catalogue, key));
    if (complete.has(lang)) for (const key of missing[lang]) failures.push(`${file}: ${key} is missing`);
  }
  return {failures, missing};
}
