import type {Key, Translator} from './index';

const known: Record<string, Key> = {
  sample_delayed: 'ui.backend.sampleDelayed',
  invalid_request: 'ui.backend.invalidRequest',
  authentication_required: 'ui.backend.authenticationRequired',
  permission_denied: 'ui.backend.permissionDenied',
  resource_not_found: 'ui.backend.resourceNotFound',
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
  geodata_update_failed: 'ui.backend.geodataUpdateFailed',
  // geodata.last_error carries the failed stage as its code.
  asset_validation_failed: 'ui.backend.assetValidationFailed',
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
  probe_failed: 'ui.backend.probeFailed'
};

export function backendMessage(code: string, message: string, t: Translator): string {
  return known[code] ? t(known[code]) : t('ui.backendMessage', {message});
}

// A bare code without a message of its own: its words when known, else the code itself.
export const backendCode = (code: string, t: Translator) => (known[code] ? t(known[code]) : code);
