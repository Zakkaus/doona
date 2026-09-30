import type {Key, Translator} from './index';
import type {ConfigDiagnostic} from '../api/model';

const known: Record<string, Key> = {
  sample_delayed: 'ui.backend.sampleDelayed',
  invalid_request: 'ui.backend.invalidRequest',
  authentication_required: 'ui.backend.authenticationRequired',
  permission_denied: 'ui.backend.permissionDenied',
  resource_not_found: 'ui.backend.resourceNotFound',
  method_not_allowed: 'ui.backend.methodNotAllowed',
  capability_not_supported: 'ui.backend.capabilityNotSupported',
  state_conflict: 'ui.backend.stateConflict',
  idempotency_conflict: 'ui.backend.idempotencyConflict',
  event_cursor_expired: 'ui.backend.eventCursorExpired',
  snapshot_unavailable: 'ui.backend.snapshotUnavailable',
  snapshot_expired: 'ui.backend.snapshotExpired',
  flow_expired: 'ui.backend.flowExpired',
  stale_revision: 'ui.backend.staleRevision',
  request_too_large: 'ui.backend.requestTooLarge',
  unsupported_media_type: 'ui.backend.unsupportedMediaType',
  unsupported_value: 'ui.backend.unsupportedValue',
  precondition_required: 'ui.backend.preconditionRequired',
  rate_limited: 'ui.backend.rateLimited',
  temporarily_unavailable: 'ui.backend.temporarilyUnavailable',
  setup_required: 'ui.backend.setupRequired',
  setup_already_completed: 'ui.backend.setupAlreadyCompleted',
  invalid_credentials: 'ui.backend.invalidCredentials',
  // Codes honk sets on operation.error, provider.last_error and health.error; the contract names the activation
  // outcomes (reload_* to store_unavailable) and leaves the rest to the adapter.
  reload_rejected: 'ui.backend.reloadRejected',
  reload_degraded: 'ui.backend.reloadDegraded',
  supervisor_reconciliation_failed: 'ui.backend.supervisorReconciliationFailed',
  activation_unconfirmed: 'ui.backend.activationUnconfirmed',
  store_unavailable: 'ui.backend.storeUnavailable',
  engine_unavailable: 'ui.backend.engineUnavailable',
  request_exhausted: 'ui.backend.requestExhausted',
  // honk builds before suspend and resume were removed report a failed one with this code; doona still offers both.
  lifecycle_failed: 'ui.backend.lifecycleFailed',
  geodata_update_failed: 'ui.backend.geodataUpdateFailed',
  // geodata.last_error carries the failed stage as its code.
  asset_validation_failed: 'ui.backend.assetValidationFailed',
  checksum_unavailable: 'ui.backend.checksumUnavailable',
  checksum_mismatch: 'ui.backend.checksumMismatch',
  download_timeout: 'ui.backend.downloadTimeout',
  http_status_rejected: 'ui.backend.httpStatusRejected',
  http_not_found: 'ui.backend.httpNotFound',
  connection_failed: 'ui.backend.connectionFailed',
  tls_failed: 'ui.backend.tlsFailed',
  http_failed: 'ui.backend.httpFailed',
  group_unavailable: 'ui.backend.groupUnavailable',
  route_blocked: 'ui.backend.routeBlocked',
  destination_rejected: 'ui.backend.destinationRejected',
  asset_too_large: 'ui.backend.assetTooLarge',
  invalid_source: 'ui.backend.invalidSource',
  probe_interrupted: 'ui.backend.probeInterrupted',
  probe_cleanup_failed: 'ui.backend.probeCleanupFailed',
  publication_rejected: 'ui.backend.publicationRejected',
  fetch_failed: 'ui.backend.fetchFailed',
  provider_replaced: 'ui.backend.providerReplaced',
  result_too_large: 'ui.backend.resultTooLarge',
  route_unavailable: 'ui.backend.routeUnavailable',
  publication_unavailable: 'ui.backend.publicationUnavailable',
  supervisor_stopped: 'ui.backend.supervisorStopped',
  probe_cancelled: 'ui.backend.probeCancelled',
  probe_deadline: 'ui.backend.probeDeadline',
  probe_failed: 'ui.backend.probeFailed',
  // Codes honk sets on runtime degradations.
  persistence_unavailable: 'ui.backend.persistenceUnavailable',
  state_cache_unavailable: 'ui.backend.stateCacheUnavailable',
  interface_watcher_disabled: 'ui.backend.interfaceWatcherDisabled',
  pname_routing_reduced: 'ui.backend.pnameRoutingReduced',
  pname_routing_disabled: 'ui.backend.pnameRoutingDisabled',
  udp_trace_unavailable: 'ui.backend.udpTraceUnavailable',
  quic_probe_disabled: 'ui.backend.quicProbeDisabled',
  // Codes honk sets on config diagnostics.
  'duplicate-subscription-entry': 'ui.backend.duplicateSubscriptionEntry'
};

const configurationRefusals = new Set(['permission_denied', 'capability_not_supported', 'temporarily_unavailable', 'invalid_request']);

const refusalReasons: Record<string, Key> = {
  configuration_unavailable: 'ui.refusal.configurationUnavailable',
  credential_sources_changed: 'ui.refusal.credentialSourcesChanged',
  import_entry_changed: 'ui.refusal.importEntryChanged',
  listener_secret_in_content: 'ui.refusal.listenerSecretInContent',
  listener_secret_source: 'ui.refusal.listenerSecretSource',
  listener_settings_changed: 'ui.refusal.listenerSettingsChanged',
  unsafe_path: 'ui.refusal.unsafePath',
  writes_disabled: 'ui.refusal.writesDisabled'
};

// Codes the demo's own validation sets, with the params their words take. honk may send the same code without them.
const demoDiagnostics: Record<string, [Key, ...string[]]> = {
  bare_condition: ['config.diagnostic.bareCondition'],
  brace_without_section: ['config.diagnostic.braceWithoutSection'],
  include_not_found: ['config.diagnostic.includeNotFound', 'path'],
  not_a_rule: ['config.diagnostic.notARule'],
  not_a_setting: ['config.diagnostic.notASetting'],
  section_not_closed: ['config.diagnostic.sectionNotClosed', 'name'],
  'source-not-included': ['config.diagnostic.sourceNotIncluded', 'path'],
  unknown_key: ['config.diagnostic.unknownKey', 'name'],
  unknown_outbound: ['config.diagnostic.unknownOutbound', 'name'],
  unknown_section: ['config.diagnostic.unknownSection', 'name']
};

// Codes arrive from the backend, so a name such as `constructor` must not find what every object inherits.
const own = <V>(table: Record<string, V>, code: string): V | undefined => (Object.hasOwn(table, code) ? table[code] : undefined);

// Codes honk reuses for unrelated failures, such as a group field, a probe target, a DNS record type, a node name
// already in use or a connection that cannot be closed: their words alone cannot tell these apart, so the backend's
// own message goes with them.
const reused = new Set(['invalid_request', 'unsupported_value', 'state_conflict']);

// A backend message as a summary in the page language and, for a reused code, the backend's words as its detail.
export type BackendMessage = {summary: string; detail?: string};

export function refusalMessage(details: unknown, t: Translator): string | undefined {
  const reason = (details as {reason?: unknown} | null)?.reason;
  const key = typeof reason === 'string' ? own(refusalReasons, reason) : undefined;
  return key ? t(key) : undefined;
}

// honk names the step that failed in details.stage. A stage with its own words says more than the code; any other
// stage is added to the code's words. A known stage that repeats the code, as a management write's `state_conflict`
// does, adds nothing, so a reused code keeps the backend's words.
export function backendMessage(code: string, message: string, t: Translator, details?: unknown, configurationWrite = false): BackendMessage {
  const refusal = refusalMessage(details, t);
  if (refusal) return {summary: refusal};
  if (configurationWrite && configurationRefusals.has(code) && message) return {summary: message};
  const named = (details as {stage?: unknown} | null | undefined)?.stage;
  const codeKey = own(known, code);
  const stage = named === code && codeKey ? undefined : named;
  const stageKey = typeof stage === 'string' ? own(known, stage) : undefined;
  if (stageKey) return {summary: t(stageKey)};
  const text = codeKey ? t(codeKey) : t('ui.backendMessage', {message});
  const summary = typeof stage === 'string' ? t('ui.aside', {text, note: stage}) : text;
  return reused.has(code) && message ? {summary, detail: message} : {summary};
}

// A config diagnostic, for its row and its editor mark alike: a known code in the page language, with the backend's
// words as the detail when they say more. A demo code missing a param its words take reads as any backend code.
export function diagnosticMessage({code, message, params}: ConfigDiagnostic, t: Translator): BackendMessage {
  const [demo, ...needs] = own(demoDiagnostics, code) ?? [];
  const key = demo && needs.every(name => params?.[name] !== undefined) ? demo : own(known, code);
  if (!key) return backendMessage(code, message, t);
  const summary = t(key, params);
  return message && message !== summary ? {summary, detail: message} : {summary};
}

// A backend message on one line, for a place with room for one.
export const oneLine = ({summary, detail}: BackendMessage, t: Translator) => (detail ? t('ui.valuePair', {label: summary, value: detail}) : summary);

export const knownCode = (code: string) => Object.hasOwn(known, code);

// A bare code without a message of its own: its words when known, else the code itself.
export const backendCode = (code: string, t: Translator) => {
  const key = own(known, code);
  return key ? t(key) : code;
};
