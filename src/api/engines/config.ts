import type {Capabilities, Version} from '../model';
import {honkConfig} from './honkConfig';
import type {ConfigManagement, EngineConfig} from './types';

// The engine's configuration extension, by the engine name its version reports; null for an engine without one. It
// stays apart from the adapters, so the shell can offer the configuration page at startup without loading them.
export function configOf(version: Pick<Version, 'engine'> | undefined): EngineConfig | null {
  switch (version?.engine.name) {
    case 'honk':
      return honkConfig;
    default:
      return null;
  }
}

// What the extension offers. An engine without one offers none of it and reports none of it off.
const unmanaged: ConfigManagement = {
  export: false,
  import: false,
  revisions: false,
  replaceRequired: false,
  canActivate: false,
  off: {export: false, import: false, revisions: false}
};
export const configManagement = (config: EngineConfig | null, capabilities: Capabilities | undefined): ConfigManagement =>
  config?.management(capabilities) ?? unmanaged;
