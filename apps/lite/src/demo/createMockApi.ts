import {createMockApi as createSharedMockApi, type MockOptions} from '../../../../mock';
import {activateInventory} from '../../../../mock/activation';
import * as configuration from '../../../../mock/fixtures/configuration';
import * as inventory from '../../../../mock/fixtures/inventory';

// The demo adds two subscriptions to the shared fixtures, so nodes and bindings span more than one source.
const configMain = configuration.configMain.replace(
  /subscription \{\n/,
  "subscription {\n  pacific: 'https://pacific.example.net/subscribe?token=demo'\n  atlas: 'https://atlas.example.net/subscribe?token=demo'\n"
);
const withMain = <T extends {kind: string; content: string}>(source: T): T => (source.kind === 'main' ? {...source, content: configMain} : source);
const providers = [
  ...inventory.providers,
  ...['pacific', 'atlas'].map(name => ({
    ...inventory.providers.find(provider => provider.id === 'harbor')!,
    id: name,
    name,
    url_redacted: `https://${name}.example.net/subscribe?token=<redacted>`
  }))
];
// Node names stay in one script whatever the interface language.
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
// The standard fixtures put every subscription node in harbor; split them across the three subscriptions.
function nodeFixtures(count: number, faults = false) {
  const result = inventory.nodeFixtures(count, faults);
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

export const demoFixtures = {
  configuration: {
    ...configuration,
    configMain,
    configSources: configuration.configSources.map(withMain),
    faultSources: configuration.faultSources.map(withMain),
    faultDisk: configuration.faultDisk.map(withMain)
  },
  inventory: {...inventory, providers, nodeFixtures}
};

export const createMockApi = (options: MockOptions) => createSharedMockApi({...options, fixtures: demoFixtures});
