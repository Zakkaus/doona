import {describe, expect, it} from 'vitest';
import {compileFilters} from './groupFilters';
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
