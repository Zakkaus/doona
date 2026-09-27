import type {Version} from '../model';
import {honk} from './honk';
import type {Engine} from './types';

export type {Engine, EngineReason, EngineSetting, EngineSubject} from './types';

// An engine doona has no knowledge of: the contract's own facts are all the page can give.
const unknown: Engine = {
  id: 'unknown',
  reason: () => undefined,
  holdsCredentials: () => false,
  snippet: settings => settings.map(({key, value}) => `${key}: ${value}`).join('\n'),
  redactedSections: () => []
};

// The engine behind the native API, by the API name its version reports; unknown until the version has loaded.
export function engineOf(version: Pick<Version, 'api'> | undefined): Engine {
  switch (version?.api.name) {
    case 'dae/honk-native':
      return honk;
    default:
      return unknown;
  }
}
