import {expect, it} from 'vitest';
import {createMockApi} from '../../api/mock';
import {translate, type Translator} from '../../i18n';
import {ruleLine} from '../rules/source';
import {rulePositions, ruleTargets} from './rule';
const t: Translator = (key, params) => translate('en', key, params);

it('offers a domain exactly or as a suffix, and otherwise the destination IP of either family', () => {
  const text = (c: {domain?: string | null; dst?: string}) => ruleTargets(c).map(target => ruleLine(target.condition, 'proxy'));
  expect(text({domain: 'api.telegram.org', dst: '149.154.167.220:443'})).toEqual([
    'domain(full: api.telegram.org) -> proxy',
    'domain(suffix: api.telegram.org) -> proxy'
  ]);
  expect(ruleTargets({domain: 'api.telegram.org'}).map(target => target.kind)).toEqual(['domain', 'domainSuffix']);
  expect(text({domain: null, dst: '1.1.1.1:53'})).toEqual(['dip(1.1.1.1) -> proxy']);
  expect(text({dst: '[2001:db8::5]:443'})).toEqual(["dip('2001:db8::5') -> proxy"]);
  expect(text({dst: '<redacted>'})).toEqual([]);
  expect(text({})).toEqual([]);
});

it('inserts before the matched rule by default, else first, and only where the source can be written', async () => {
  const api = createMockApi();
  const [{rules}, {sources}] = await Promise.all([api.rules(), api.config()]);
  const ids = (matched: string | null, list = sources) => rulePositions(rules, list, matched, t).map(position => [position.id, position.label]);
  expect(ids('r5')).toEqual([
    ['r5', 'Before the matched rule'],
    ['r1', 'First']
  ]);
  expect(rulePositions(rules, sources, 'r5', t)[0].desc).toBe('domain(geosite: telegram)');
  expect(ids('r1')).toEqual([['r1', 'Before the matched rule']]);
  expect(ids(null)).toEqual([['r1', 'First']]);
  expect(ids('gone')).toEqual([['r1', 'First']]);
  expect(ids('fallback')).toEqual([
    ['fallback', 'Before the matched rule'],
    ['r1', 'First']
  ]);
  // A rule in a read-only include is not offered; the first rule still is.
  const readOnly = sources.map(source => (source.id === 'src-rules' ? {...source, writable: false} : source));
  expect(ids('r7', readOnly)).toEqual([['r1', 'First']]);
  expect(
    ids(
      'r7',
      sources.map(source => ({...source, writable: false}))
    )
  ).toEqual([]);
});
