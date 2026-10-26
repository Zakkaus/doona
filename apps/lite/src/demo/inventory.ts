import * as original from '../../../../mock/fixtures/inventory';
import {activateInventory} from '../../../../mock/activation';
import {configMain} from './configuration';
export * from '../../../../mock/fixtures/inventory';

export const providers = [
  ...original.providers,
  ...['pacific', 'atlas'].map(name => ({
    ...original.providers.find(provider => provider.id === 'harbor')!,
    id: name,
    name,
    url_redacted: `https://${name}.example.net/subscribe?token=<redacted>`
  }))
];
const neutralNames: Record<string, string> = {
  台灣: 'Taiwan',
  美國: 'US',
  韓國: 'Korea',
  英國: 'UK',
  德國: 'Germany',
  澳洲: 'Australia',
  家寬: 'Residential',
  解鎖: 'Unlocked',
  流媒體: 'Streaming'
};
export function nodeFixtures(count: number, faults = false) {
  const result = original.nodeFixtures(count, faults);
  let index = 0;
  for (const node of result.nodes) {
    if (node.provider_id !== 'harbor') continue;
    node.name = node.name.replace(/台灣|美國|韓國|英國|德國|澳洲|家寬|解鎖|流媒體/g, name => neutralNames[name]);
    node.provider_id = ['harbor', 'pacific', 'atlas'][Math.floor(index++ / Math.max(1, Math.ceil(count / 3)))];
    node.subscription_tag = node.provider_id;
  }
  activateInventory(configMain, '40', result.nodes, result.groups, structuredClone(providers), name => name);
  return result;
}
