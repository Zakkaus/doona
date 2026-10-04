import type {Api} from '../src/api/api';
import type {OperationReader} from './lifecycle';
import {capabilities as fullCapabilities, capabilitiesBase, capabilitiesM1} from './fixtures/capabilities';
import {createConfiguration} from './configuration';
import {createInventory} from './inventory';
import {createLifecycle} from './lifecycle';
import {createNetwork} from './network';
import {createRuntime} from './runtime';
import {createGeodataState} from './geodata';
import {mockSessionValid, refuseWithoutSession, withPasswordAuth} from './auth';

export type MockApi = Api & OperationReader;

// A saved demo profile signs in as a password backend does; with no profile at all (development, the test suites)
// the mock serves every read straight away. `faults` selects the faults scenario where storage cannot, as for the
// specs' in-process backend. `acceptWrites` answers node and provider writes with 202 and an operation, as a honk
// that runs them in the background does.
export type MockOptions = {
  capabilities?: typeof fullCapabilities;
  faults?: boolean;
  signIn?: true;
  session?: string | null;
  acceptWrites?: boolean;
  isolated?: boolean;
};

export function createMockApi(options: MockOptions = {}): MockApi {
  let count = 120;
  let big = false;
  // A busy backend for tools/perf.mjs: byte counters move on every poll and logs arrive every 20 ms.
  let busy = false;
  if (!options.isolated)
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
  // The default demo is a healthy honk; the faults scenario seeds the degraded states that specs need.
  let faults = options.faults ?? false;
  let latency = 0;
  if (!options.isolated)
    try {
      // ?scenario=faults in the page address turns the scenario on for this browser, and an empty ?scenario= turns it
      // off, so the public demo can show the error states from a link.
      const scenario = new URLSearchParams(globalThis.location?.search).get('scenario');
      if (scenario === 'faults') localStorage.setItem('doona-mock-scenario', 'faults');
      else if (scenario === '') localStorage.removeItem('doona-mock-scenario');
      faults ||= localStorage.getItem('doona-mock-scenario') === 'faults';
      // ?slow=<ms> (or ?slow alone, two seconds) holds every call for this page load, so a first load's placeholders
      // can be seen in the demo.
      const slow = new URLSearchParams(globalThis.location?.search).get('slow');
      if (slow !== null) latency = Number(slow) || 2000;
      profile = localStorage.getItem('doona-mock-profile');
      if (profile === 'base') capabilities = capabilitiesBase;
      if (profile === 'm1') capabilities = capabilitiesM1;
    } catch {
      /* Storage can be unavailable. */
    }
  capabilities = options.capabilities ?? capabilities;
  const runtime = createRuntime(capabilities, big, () => configuration.flowRecorder(), faults);
  const geodata = createGeodataState(capabilities, () => inventory.groupIds(), faults);
  const configuration = createConfiguration(
    capabilities,
    runtime.runtime,
    {
      enqueue: (kind, finish) => lifecycle.enqueue(kind, finish),
      log: (level, target, message, fields) => lifecycle.log(level, target, message, fields),
      publish: event => lifecycle.publish(event),
      eventData: () => lifecycle.eventData(),
      trimRecords: () => {
        lifecycle.trimLogs();
        network.trimRecords();
      }
    },
    () => inventory.groupNames(),
    (text, revision) => inventory.activate(text, revision),
    geodata,
    faults
  );
  const lifecycle = createLifecycle(
    capabilities.resources.logs,
    capabilities.resources.events,
    capabilities.resources.operations,
    runtime.runtime,
    configuration.logSettings,
    configuration.revision,
    configuration.recording,
    busy ? 20 : 2500,
    faults
  );
  const network = createNetwork(
    capabilities,
    big,
    profile,
    runtime.outbounds,
    configuration.revision,
    configuration.ruleSnapshot,
    configuration.dnsUpstreams,
    configuration.recording,
    configuration.networkSettings,
    busy,
    faults
  );
  const inventory = createInventory(
    capabilities,
    count,
    lifecycle,
    configuration.advance,
    configuration.editSource,
    network.interrupt,
    geodata,
    faults,
    options.acceptWrites
  );
  let api = {...runtime.api, ...lifecycle.api, ...network.api, ...inventory.api, ...configuration.api};
  if (latency) api = withLatency(api, latency);
  if (!options.signIn) return api;
  return mockSessionValid(options.session) ? withPasswordAuth(api) : refuseWithoutSession(api);
}

// Every API call returns a promise, so each can start late.
function withLatency<T extends object>(api: T, ms: number): T {
  const wait = () => new Promise(resolve => setTimeout(resolve, ms));
  return Object.fromEntries(
    Object.entries(api).map(([key, call]) => [key, (...args: unknown[]) => wait().then(() => (call as (...args: unknown[]) => unknown)(...args))])
  ) as T;
}
