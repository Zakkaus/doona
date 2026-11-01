import {describe, expect, it} from 'vitest';
import {compileFilters} from './groupFilters';
import {writeGroupEntry} from './groups';
import {
  conditionValues,
  groupFilterDraft,
  groupFilterText,
  newGroupFilter,
  parseConditionValues,
  parseGroupConditions,
  reconcileGroupFilters,
  serializeGroupConditions
} from './groupConditions';

describe('visual group conditions', () => {
  it.each([
    ` name(keyword: "HK")  && ! subtag('trial') `,
    `name(regex: '(?i)(hk|jp)\\b') && !name('CN2 回国 HK', "HK 01")`,
    `subtag(regex: '^paid') && subtag(keyword: 'west')`,
    `group("auto", 'jp|new group')`,
    `name(keyword: 'a,b', keyword: 'a && b')`,
    `name(regex: '^hk-[0-9]{1,3}$')`,
    `!name(keyword: "hk", regex: '^jp', 'sg-01') && subtag(keyword: 'paid', regex: '^trial')`
  ])('preserves untouched source bytes: %s', source => {
    const draft = groupFilterDraft(source);
    expect(draft.rows).not.toBeNull();
    expect(groupFilterText(draft)).toBe(source);
    const row = draft.rows![0];
    const edited = {...draft, rows: draft.rows!.map((item, i) => (i ? item : {...row, negate: !row.negate}))};
    expect(groupFilterText({...edited, rows: draft.rows})).toBe(source);
  });
  it('builds AND rows and OR lines with explicit expected node names', () => {
    const rows = parseGroupConditions(`name(regex: '(?i)(^|[^a-z])hk([^a-z]|$)') && !subtag('trial')`)!;
    rows[1] = {...rows[1], value: 'free'};
    const first = serializeGroupConditions(rows)!;
    expect(first).toBe(`name(regex: '(?i)(^|[^a-z])hk([^a-z]|$)') && !subtag('free')`);
    const nodes = ['hk-01', 'HK 01', 'AUS 01', 'CN2 回国 HK', 'shk-01'].map((name, i) => ({name, subscription_tag: i === 1 ? 'free' : 'paid'}));
    expect(nodes.filter(compileFilters([first, `name('AUS 01')`])).map(node => node.name)).toEqual(['hk-01', 'AUS 01', 'CN2 回国 HK']);
  });
  it.each([
    'group(auto) && name(hk)',
    '!group(auto)',
    'name(hk) || name(jp)',
    'unknown(hk)',
    'name(hk) &&',
    'name()',
    "name('unterminated)",
    `name("O'Reilly", "other")`,
    `name("O'Reilly")`
  ])('retains unrepresentable source as raw: %s', source => expect(parseGroupConditions(source)).toBeNull());
  it('keeps incomplete values in drafts and refuses to serialize them', () => {
    const fresh = newGroupFilter();
    expect(groupFilterText(fresh)).toBeNull();
    expect(reconcileGroupFilters([fresh], ['', 'name(hk)'])[0]).toBe(fresh);
    expect(serializeGroupConditions([{...fresh.rows![0], kind: 'group', value: 'auto', negate: true}])).toBeNull();
  });
  it('round trips CSV values including commas, spaces, quotes and regex escapes', () => {
    const values = ['HK 01', 'a,b', 'a"b', '^hk-\\d{1,3}$', ' leading'];
    expect(parseConditionValues(conditionValues(values))).toEqual(values);
    for (const invalid of ['', 'a,', '"a"b', '"unterminated', "a'b", 'a\\']) expect(parseConditionValues(invalid)).toBeNull();
  });
});

it('keeps mixed argument OR inside its negated AND condition', () => {
  const source = `!name(keyword: "hk", regex: '^jp', 'sg-01') && name(regex: '01$')`;
  const draft = groupFilterDraft(source);
  expect(draft.rows).not.toBeNull();
  expect(groupFilterText(draft)).toBe(source);
  const rows = draft.rows!;
  rows[0].value = 'HK';
  const text = groupFilterText(draft)!;
  expect(text).toBe(`!name(keyword: 'HK', regex: '^jp', 'sg-01') && name(regex: '01$')`);
  expect(['hk-01', 'HK 01', 'jp-01', 'sg-01', 'AUS 01', 'CN2 回国 HK'].filter(name => compileFilters([text])({name, subscription_tag: null}))).toEqual([
    'hk-01',
    'AUS 01'
  ]);
});

describe('country-flag emoji and CJK terms', () => {
  const regex = '🇭🇰|HK|hk|港|HongKong|🇺🇸|US|美国|美|United States';
  const nodes = ['🇭🇰 HK-01', '🇺🇸 US 美国', 'United States 02', 'JP 日本'];
  const admitted = (filter: string) => nodes.filter(name => compileFilters([filter])({name, subscription_tag: null}));

  it('writes the values byte for byte through every row shape', () => {
    const row = (kind: 'nameRegex' | 'nameKeyword', value: string) => ({id: 1, kind, value, negate: false});
    expect(serializeGroupConditions([row('nameRegex', regex)])).toBe(`name(regex: '${regex}')`);
    expect(serializeGroupConditions([row('nameRegex', conditionValues([regex, '(?i)jp|日本']))])).toBe(`name(regex: '${regex}', regex: '(?i)jp|日本')`);
    expect(serializeGroupConditions([row('nameKeyword', '🇭🇰, HK, 港')])).toBe(`name(keyword: '🇭🇰', keyword: 'HK', keyword: '港')`);
    expect(serializeGroupConditions([{...row('nameRegex', regex), alternatives: [{id: 2, kind: 'nameKeyword', value: 'US, 美国'}]}])).toBe(
      `name(regex: '${regex}', keyword: 'US', keyword: '美国')`
    );
  });

  it('reads the written filter back as the same row and keeps it untouched', () => {
    const source = `name(regex: '${regex}')`;
    const draft = groupFilterDraft(source);
    expect(draft.rows).toMatchObject([{kind: 'nameRegex', value: regex, negate: false}]);
    expect(groupFilterText(draft)).toBe(source);
    expect(serializeGroupConditions(draft.rows!)).toBe(source);
  });

  it('keeps every code point of the text sent to the backend', () => {
    const text = writeGroupEntry("group {\n  proxy {\n    filter: name(keyword: 'old')\n    policy: min_moving_avg\n  }\n}\n", 'proxy', {
      filters: [`name(regex: '${regex}')`],
      policy: 'min_moving_avg'
    });
    expect(text).toContain(`filter: name(regex: '${regex}')`);
    expect(new TextDecoder().decode(new TextEncoder().encode(JSON.parse(JSON.stringify({content: text})).content))).toBe(text);
  });

  it('previews the nodes the filter selects', () => {
    expect(admitted(`name(regex: '${regex}')`)).toEqual(['🇭🇰 HK-01', '🇺🇸 US 美国', 'United States 02']);
    expect(admitted(`name(keyword: '🇭🇰', keyword: '日本')`)).toEqual(['🇭🇰 HK-01', 'JP 日本']);
  });
});
