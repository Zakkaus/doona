import type {TextBlock} from '../../dae/text';
import type {Capabilities, ConfigSource} from '../model';

// What the engine can be asked about: a capabilities resource, or one of the actions the contract flags on a resource.
// `manage` stands for adding and editing nodes and subscriptions (nodes and providers `can_manage`), `subscriptions`
// for refreshing them (providers `can_refresh`), `close` for closing connections (connections `can_close`).
export type EngineSubject = keyof Capabilities['resources'] | 'manage' | 'subscriptions' | 'close';

// A setting in the engine's configuration text, with its value as the text writes it, e.g. `record_logs: true`.
export type EngineSetting = {key: string; value: string};

// Why a subject is off, as far as the engine can tell. A reason with settings names the ones that lift it.
export type EngineReason =
  // A recorder the configuration turns off.
  | {code: 'recorder-off'; settings: EngineSetting[]}
  // Flows are recorded only while a client views them.
  | {code: 'recorded-on-demand'}
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
  // The running build does not have the feature.
  | {code: 'build-lacks'};

// An engine's explanations for what the native API contract states without a reason. An engine that does not know a
// reason says nothing, so the page falls back to what the contract says.
export type Engine = {
  id: 'honk' | 'unknown';
  // Why `subject` is off, given that the capabilities show it is; undefined when the engine does not say.
  reason(subject: EngineSubject, capabilities: Capabilities): EngineReason | undefined;
  // Whether the engine refuses to write a source because its text holds credentials it will not write back.
  holdsCredentials(source: Pick<ConfigSource, 'content'>): boolean;
  // The settings as a snippet of the engine's configuration text.
  snippet(settings: EngineSetting[]): string;
  // A setting's full name in the configuration text, by which it can be found there.
  settingName(key: string): string;
  // The top-level sections whose text the engine redacts when it returns a source, each with the name the page shows.
  redactedSections(blocks: TextBlock[]): Array<{block: TextBlock; name: string}>;
  // Whether the configuration text is dae's, which doona reads and writes; a page that infers settings from the text
  // or edits it by hand checks this first.
  daeText: boolean;
  // The hooks the engine attaches but does not check afterwards, so it reports their state as `unknown`.
  uncheckedHooks: string[];
};
