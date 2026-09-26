import type {Api} from '../api';
import type {OperationReader} from './lifecycle';
import {capabilities as fullCapabilities, capabilitiesBase, capabilitiesM1} from './fixtures/capabilities';
import {createConfiguration} from './configuration';
import {createInventory} from './inventory';
import {createLifecycle} from './lifecycle';
import {createNetwork} from './network';
import {createRuntime} from './runtime';
import {createGeodataState} from './geodata';

export type MockApi = Api & OperationReader;

export function createMockApi(): MockApi {
  let count = 120;
  let big = false;
  // A busy backend for tools/perf.mjs: byte counters move on every poll and logs arrive every 20 ms.
  let busy = false;
  try {
    const value = localStorage.getItem('doona-mock-big');
    big = value !== null;
    if (value !== null) count = Math.max(0, Math.floor(Number(value) || 0));
    busy = localStorage.getItem('doona-mock-busy') !== null;
  } catch {
    /* Storage can be unavailable. */
  }
  let capabilities = fullCapabilities;
  let profile: string | null = null;
  try {
    profile = localStorage.getItem('doona-mock-profile');
    if (profile === 'base') capabilities = capabilitiesBase;
    if (profile === 'm1') capabilities = capabilitiesM1;
  } catch {
    /* Storage can be unavailable. */
  }
  const runtime = createRuntime(capabilities, big);
  const geodata = createGeodataState(capabilities, () => inventory.groupIds());
  const configuration = createConfiguration(
    capabilities,
    runtime.runtime,
    {
      enqueue: (kind, finish) => lifecycle.enqueue(kind, finish),
      log: (level, target, message, fields) => lifecycle.log(level, target, message, fields),
      publish: event => lifecycle.publish(event),
      eventData: () => lifecycle.eventData(),
      trimLogs: () => lifecycle.trimLogs()
    },
    () => inventory.groupNames(),
    (text, revision) => inventory.activate(text, revision),
    geodata
  );
  const lifecycle = createLifecycle(
    capabilities.resources.logs,
    capabilities.resources.events,
    runtime.runtime,
    configuration.logSettings,
    configuration.revision,
    busy ? 20 : 2500
  );
  const network = createNetwork(capabilities, big, profile, runtime.outbounds, configuration.revision, configuration.ruleSnapshot, busy);
  const inventory = createInventory(capabilities, count, lifecycle, configuration.advance, configuration.editMain, network.interrupt, geodata);
  return {...runtime.api, ...lifecycle.api, ...network.api, ...inventory.api, ...configuration.api};
}
