import type {Capabilities, EffectiveConfig} from '../model';
import type {ConfigManagement, EngineConfig} from './types';

type Extension = {
  config_export?: {available?: boolean};
  config_import?: {available?: boolean; replace_required?: boolean};
  config_revisions?: {available?: boolean; can_activate?: boolean; max_revisions?: number};
};
type HonkConfig = EffectiveConfig & {
  'x-honk'?: {store?: {kind: 'file' | 'db'; revision: number | null; parent: number | null; recorded: boolean}};
};
function management(capabilities: Capabilities | undefined): ConfigManagement {
  const ext = capabilities?.extensions?.['x-honk'] as Extension | undefined;
  return {
    export: ext?.config_export?.available === true,
    import: ext?.config_import?.available === true,
    revisions: ext?.config_revisions?.available === true,
    replaceRequired: ext?.config_import?.replace_required === true,
    canActivate: ext?.config_revisions?.available === true && ext.config_revisions.can_activate === true,
    maxRevisions: ext?.config_revisions?.max_revisions,
    off: {
      export: ext?.config_export?.available === false,
      import: ext?.config_import?.available === false,
      revisions: ext?.config_revisions?.available === false
    }
  };
}
function configStore(config: EffectiveConfig | undefined) {
  const store = (config as HonkConfig | undefined)?.['x-honk']?.store;
  return store ? {recorded: store.recorded} : undefined;
}
function exportFilename(disposition: string | null): string {
  const name = /filename="([^"]+)"|filename=([^;\s]+)/i.exec(disposition ?? '');
  const basename = (name?.[1] ?? name?.[2] ?? '')
    .split(/[\\/]/)
    .pop()
    ?.replace(/[\x00-\x1f\x7f]/g, '');
  return basename && basename !== '.' && basename !== '..' ? basename : 'honk.dae';
}

export const honkConfig: EngineConfig = {
  management,
  store: configStore,
  paths: {
    export: '/api/v1/x-honk/config/export',
    import: '/api/v1/x-honk/config/import',
    revisions: '/api/v1/x-honk/config/revisions',
    activate: '/api/v1/x-honk/config/revisions/{revision}/activate'
  },
  exportFilename
};
