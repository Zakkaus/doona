import type {SettingsSection} from '../../dae/settings';
import type {TextBlock} from '../../dae/text';
import type {Capabilities, ConfigSource, RuntimeSettings} from '../model';

// What the engine can be asked about: a capabilities resource, or an action that can be off while its resource is on,
// named after the contract field that flags it: `manage` (nodes and providers `can_manage`), `subscriptions`
// (`can_refresh`), `close` (`can_close`), `create`, `validate_full` (config_validate `modes`), `group_edit` (groups
// `config_patch`), `selection`, `trace_live` (routing_trace `resolve_modes`), the DNS cache's `read`, `delete_entry` and
// `flush`, and `geodata_settings` (geodata `configurable_sources`). `global_settings`, `mode` and `rule_edit` are the
// forms and editors that write the configuration; `export`, `import`, `revisions` and `restore` are engine extensions.
export type EngineAction =
  | 'manage'
  | 'subscriptions'
  | 'close'
  | 'create'
  | 'validate_full'
  | 'global_settings'
  | 'mode'
  | 'rule_edit'
  | 'export'
  | 'import'
  | 'revisions'
  | 'restore'
  | 'group_edit'
  | 'selection'
  | 'trace_live'
  | 'dns_cache_read'
  | 'dns_cache_delete'
  | 'dns_cache_flush'
  | 'geodata_settings';
export type EngineSubject = keyof Capabilities['resources'] | EngineAction;

// A setting in the engine's configuration text by its full dotted name, by which it can be found there, with its value
// as the text writes it, e.g. `experimental.native_api.record_logs` and `true`.
export type EngineSetting = {key: string; value: string};

// Why a subject is off, as far as the engine can tell. A reason with settings names the ones that lift it.
export type EngineReason =
  // A recorder the configuration turns off.
  | {code: 'recorder-off'; settings: EngineSetting[]}
  // Flows are recorded only while a client views them.
  | {code: 'recorded-on-demand'}
  // A recorder the configuration allows, whose mode in the runtime settings is off.
  | {code: 'mode-off'}
  // A service that runs only while the engine is up, while it is starting or stopping.
  | {code: 'starting-or-stopping'}
  // Routing and DNS loaded different geodata files of one kind.
  | {code: 'geodata-mismatch'}
  // The configuration is not loaded: the engine is starting, or the sources exceed its limits.
  | {code: 'config-unloaded'}
  // Configuration writes are turned off.
  | {code: 'writes-off'; settings: EngineSetting[]}
  // The main file refuses node and subscription edits.
  | {code: 'main-file-read-only'}
  // Geodata has no built-in download URLs: the engine takes them from the configuration, from these settings.
  | {code: 'no-download-urls'; settings: EngineSetting[]}
  // The engine must be started with this command-line flag; the first import also needs these settings and one of
  // these credentials, each as the configuration writes it.
  | {code: 'start-flag'; flag: string; settings: EngineSetting[]; credentials: string[]}
  // The engine's state database did not open. The features it holds do not need `writeSwitch`, the setting that turns
  // configuration writes on.
  | {code: 'state-db-closed'; writeSwitch: string}
  // No setting turns the feature on.
  | {code: 'no-switch'}
  // The running build does not have the feature.
  | {code: 'build-lacks'};

// An engine's explanations for what the native API contract states without a reason. An engine that does not know a
// reason says nothing, so the page falls back to what the contract says.
export type Engine = {
  id: 'honk' | 'unknown';
  // Seconds the engine keeps recording flow demand after the last client read or stream; null when it does not say.
  flowDemandGraceSeconds: number | null;
  // Why `subject` is off, given that the capabilities show it is; undefined when the engine does not say.
  reason(subject: EngineSubject, capabilities: Capabilities, recording?: RuntimeSettings['recording']): EngineReason | undefined;
  // Whether the engine refuses to write a source because its text holds credentials it will not write back.
  holdsCredentials(source: Pick<ConfigSource, 'content'>): boolean;
  // The settings as a snippet of the engine's configuration text.
  snippet(settings: EngineSetting[]): string;
  // The top-level sections whose text the engine redacts when it returns a source, each with the name the page shows.
  redactedSections(blocks: TextBlock[]): Array<{block: TextBlock; name: string}>;
  // Whether the configuration text is dae's, which doona reads and writes; a page that infers settings from the text
  // or edits it by hand checks this first.
  daeText: boolean;
  nodeLinkSchemes: readonly string[] | null;
  globalSettings: SettingsSection | null;
  // The hooks the engine attaches but does not check afterwards, so it reports their state as `unknown`.
  uncheckedHooks: string[];
};
