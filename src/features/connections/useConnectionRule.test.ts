import {expect, it} from 'vitest';
import {createMockApi} from '../../api/mock';
import {ruleTargets} from '../shared/rule';
import {connectionSeed} from './useConnectionRule';

it('seeds the add-rule dialog from a connection and vouches only for a recorded match', async () => {
  const {tcp} = await createMockApi().connections();
  const base = {...tcp[0], domain: 'a.example.', dst: '[2001:db8::5]:443', src: '10.0.0.2:5000', rule_id: 'r5', rule_expression: 'domain(geosite: telegram)'};
  const seed = connectionSeed({...base, rule_source: 'kernel'});
  expect(seed).toMatchObject({domain: 'a.example.', dip: '2001:db8::5', sip: '10.0.0.2', matched: {id: 'r5', expression: 'domain(geosite: telegram)'}});
  // The resolver's trailing dot does not reach the rule.
  expect(ruleTargets(seed)[0].condition).toBe(ruleTargets({domain: 'a.example', dip: null, sip: null})[0].condition);
  expect(connectionSeed({...base, rule_source: 'unknown'}).matched).toBeNull();
  // A redacted destination offers no address, and the domain and source still do.
  const redacted = connectionSeed({...base, dst: '<redacted>'});
  expect(redacted.dip).toBeNull();
  expect(ruleTargets(redacted).map(target => target.kind)).toEqual(['domain', 'domainSuffix', 'domainKeyword', 'sip']);
});
