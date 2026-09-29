import type {Key, Translator} from './index';

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
  // Codes honk sets on operation.error, provider.last_error and health.error; the contract leaves these to the adapter.
  reload_rejected: 'ui.backend.reloadRejected',
  reload_degraded: 'ui.backend.reloadDegraded',
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

// Codes honk reuses for unrelated failures, such as a group field, a probe target, a DNS record type, a node name
// already in use or a connection that cannot be closed: their words alone cannot tell these apart, so the backend's
// own message goes with them.
const reused = new Set(['invalid_request', 'unsupported_value', 'state_conflict']);

// A backend message as a summary in the page language and, for a reused code, the backend's words as its detail.
export type BackendMessage = {summary: string; detail?: string};

// honk names the step that failed in details.stage. A stage with its own words says more than the code; any other
// stage is added to the code's words.
export function backendMessage(code: string, message: string, t: Translator, details?: unknown): BackendMessage {
  const stage = (details as {stage?: unknown} | null | undefined)?.stage;
  if (typeof stage === 'string' && known[stage]) return {summary: t(known[stage])};
  const text = known[code] ? t(known[code]) : t('ui.backendMessage', {message});
  const summary = typeof stage === 'string' ? t('ui.aside', {text, note: stage}) : text;
  return reused.has(code) && message ? {summary, detail: message} : {summary};
}

// A backend message on one line, for a place with room for one.
export const oneLine = ({summary, detail}: BackendMessage, t: Translator) => (detail ? t('ui.valuePair', {label: summary, value: detail}) : summary);

export const knownCode = (code: string) => Object.hasOwn(known, code);

// A bare code without a message of its own: its words when known, else the code itself.
export const backendCode = (code: string, t: Translator) => (known[code] ? t(known[code]) : code);
