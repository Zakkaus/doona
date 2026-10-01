import {describe, expect, it} from 'vitest';
import {nodeFixtures} from '../../api/mock/fixtures';
import {compileFilters, readGroupEntries, writeGroupEntry} from '../../dae/groups';
import {regionGroups} from '../../dae/templates';
import {includeChoices, includeMatches, recogniseInclude, regionFilters, selectedIncludes, setIncludes} from './groupIncludes';

const hk = regionFilters.find(region => region.id === 'HK')!.filter;
const cn = regionFilters.find(region => region.id === 'CN')!.filter;
describe('visual group includes', () => {
  it('recognises template regions, exact lists and leaves compound filters advanced', () => {
    for (const group of regionGroups) expect(recogniseInclude(group.lines[0].slice(8))).toEqual({kind: 'region', values: [group.name.toUpperCase()]});
    expect(recogniseInclude("name( '香港 01', node-2 )")).toEqual({kind: 'node', values: ['香港 01', 'node-2']});
    expect(recogniseInclude('subtag("paid", backup)')).toEqual({kind: 'subscription', values: ['paid', 'backup']});
    for (const filter of ["subtag(paid) && !name(keyword: 'slow')", '!name(block)', 'group(auto)', "name(regex: 'custom')"])
      expect(recogniseInclude(filter)).toBeNull();
  });

  it('saves mixed filters without changing any source bytes, including comments and compact entries', () => {
    for (const source of [
      `# before\ngroup {\n  g {\n    filter: ${hk} # region\n    filter: subtag( 'paid', backup )\n    filter: name("香港 01", node-2)\n    filter: subtag(paid) && !name(keyword: 'slow')\n    policy: select\n    default: 'node-2'\n  }\n}\n`,
      'group { g { filter: name(a) policy: select } }\n'
    ]) {
      const entry = readGroupEntries(source)[0];
      let filters = entry.filters;
      for (const kind of ['region', 'subscription', 'node'] as const) filters = setIncludes(filters, kind, selectedIncludes(filters, kind));
      expect(writeGroupEntry(source, 'g', {...entry, filters})).toBe(source);
    }
  });

  it('changes only the selected kind, preserves untouched text and appends one filter per addition', () => {
    const advanced = "subtag(paid) && !name(keyword: 'slow')";
    const original = [advanced, hk, 'name( \'old\', "kept" )', 'subtag( paid )'];
    const changed = setIncludes(original, 'node', ['kept', '新節點']);
    expect(changed).toEqual([advanced, hk, 'name("kept")', 'subtag( paid )', "name('新節點')"]);
    expect(setIncludes(changed, 'region', ['CN'])).toEqual([advanced, 'name("kept")', 'subtag( paid )', "name('新節點')", cn]);
    expect(setIncludes(changed, 'subscription', ['paid', 'second tag'])).toEqual([...changed, "subtag('second tag')"]);
    const source = writeGroupEntry('group {\n}\n', 'g', {filters: changed, policy: 'select'});
    expect(readGroupEntries(source)[0].filters).toEqual(changed);
    expect(source.split('\n').filter(line => line.includes('filter:'))).toHaveLength(changed.length);
  });

  it('unions choices, intersects compound terms and handles template case flags and exclusions', () => {
    const nodes = ['香港 01', 'HK 02', 'JP 01', '中国上海', 'china 01', '中国香港', 'CN2 回国 HK'].map(name => ({name, subscription_tag: null}));
    expect(nodes.filter(compileFilters([cn])).map(node => node.name)).toEqual(['中国上海', 'china 01']);
    const filters = setIncludes(setIncludes([], 'region', ['HK', 'CN']), 'node', ['JP 01']);
    expect(nodes.filter(compileFilters(filters))).toHaveLength(nodes.length);
    expect(compileFilters(["name(keyword: 'HK') && !name(keyword: '02')"])(nodes[1])).toBe(false);
  });

  it('keeps untouched filter lines and comments in place when removing an earlier selection', () => {
    const source = `group {\n  g {\n    filter: ${hk}\n    check_url: 'https://example.com'\n\tfilter:  subtag( 'paid' ) # subscription\n    filter: name("kept") # node\n    policy: select\n  }\n}\n`;
    const entry = readGroupEntries(source)[0];
    const filters = setIncludes(entry.filters, 'region', []);
    expect(writeGroupEntry(source, 'g', {...entry, filters})).toBe(source.replace(`    filter: ${hk}\n`, ''));
    const added = setIncludes(filters, 'node', ['kept', 'new']);
    expect(writeGroupEntry(source, 'g', {...entry, filters: added})).toBe(
      source.replace(`    filter: ${hk}\n`, '').replace('    policy:', '    filter: name(new)\n    policy:')
    );
  });

  it('counts matches and retains absent names and subscription tags as selectable values', () => {
    const {nodes} = nodeFixtures(0, true);
    const choices = includeChoices(['subtag(missing)', "name('offline node')"], nodes, [], 'en');
    expect(choices.region.find(region => region.id === 'HK')?.count).toBe(nodes.filter(compileFilters([hk])).length);
    expect(choices.subscription).toContainEqual({id: 'missing', label: 'missing', count: 0, disabled: false});
    expect(choices.node).toContainEqual({id: 'offline node', label: 'offline node', count: 0, disabled: false});
    expect(setIncludes([], 'node', ["O'Hare"])).toEqual([]);
  });
});

it('matches explicit demo names and case-insensitive region tokens', () => {
  const {nodes} = nodeFixtures(0, true);
  const expected: Record<string, string[]> = {HK: ['hk-01', 'hk-02'], JP: ['jp-01'], SG: ['sg-01'], US: ['us-01'], TW: [], KR: []};
  for (const [id, names] of Object.entries(expected))
    expect(
      nodes.filter(compileFilters(setIncludes([], 'region', [id]))).map(node => node.name),
      id
    ).toEqual(names);
  const names = ['hk-01', 'HK 01', 'AUS 01', 'CN2 回国 HK', 'us-01', 'US 01', 'jp-01', 'tw-01', 'sg-01', 'kr-01', 'shk-01', 'HK01', '中国香港', '中国上海'];
  const realistic = names.map(name => ({name, subscription_tag: null}));
  for (const [id, wanted] of Object.entries({
    HK: ['hk-01', 'HK 01', 'CN2 回国 HK', '中国香港'],
    US: ['us-01', 'US 01'],
    AU: ['AUS 01'],
    JP: ['jp-01'],
    TW: ['tw-01'],
    SG: ['sg-01'],
    KR: ['kr-01'],
    CN: ['中国上海']
  }))
    expect(
      realistic.filter(compileFilters(setIncludes([], 'region', [id]))).map(node => node.name),
      id
    ).toEqual(wanted);
});

it('preserves every legacy template until that selection is removed', () => {
  for (const group of regionGroups) {
    const legacy = group.lines[0].slice(8);
    const source = `group {\n  g {\n\tfilter:  ${legacy} # keep\n    policy: select\n  }\n}\n`;
    const filters = setIncludes([legacy], 'region', [group.name.toUpperCase()]);
    expect(writeGroupEntry(source, 'g', {filters, policy: 'select'})).toBe(source);
    expect(setIncludes(filters, 'node', ['new'])).toEqual([legacy, 'name(new)']);
  }
});

it('counts the kept legacy region and its replacement from the same explicit matches', () => {
  const nodes = nodeFixtures(0, true).nodes;
  const legacy = regionFilters.find(region => region.id === 'HK')!.legacy!;
  for (const [filters, expected] of [
    [[legacy], []],
    [[hk], ['hk-01', 'hk-02']],
    [
      [legacy, hk],
      ['hk-01', 'hk-02']
    ]
  ] as Array<[string[], string[]]>) {
    const matches = includeMatches(filters, nodes);
    expect(matches.selected.map(node => node.name)).toEqual(expected);
    expect(matches.regions.get('HK')!.map(node => node.name)).toEqual(expected);
    const choices = includeChoices(filters, nodes, [], 'en');
    expect(choices.region.find(region => region.id === 'HK')!.count).toBe(expected.length);
    expect(choices.matchedNodes.map(node => node.name)).toEqual(expected);
  }
  const demo = nodeFixtures(120, true).nodes;
  const demoNames = [
    '香港 01 IPLC',
    '香港 02 解鎖',
    '香港 03 0.5x',
    '香港 04',
    '香港 05 0.5x',
    '香港 06',
    '香港 07 0.5x',
    '香港 08',
    '香港 09 2x',
    '香港 10 IPLC',
    '香港 11 IPLC',
    '香港 12 BGP'
  ];
  expect(includeMatches([legacy], demo).selected.map(node => node.name)).toEqual(demoNames);
  expect(includeMatches([hk], demo).selected.map(node => node.name)).toEqual(['hk-01', 'hk-02', ...demoNames]);
  const realistic = ['hk-01', 'HK 01', 'AUS 01', 'CN2 回国 HK'].map(name => ({...nodes[0], name}));
  expect(includeMatches([legacy], realistic).selected.map(node => node.name)).toEqual(['HK 01', 'CN2 回国 HK']);
  expect(includeMatches([hk], realistic).selected.map(node => node.name)).toEqual(['hk-01', 'HK 01', 'CN2 回国 HK']);
});
