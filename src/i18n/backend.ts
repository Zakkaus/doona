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
  invalid_credentials: 'ui.backend.invalidCredentials'
};

export function backendMessage(code: string, message: string, t: Translator): string {
  return known[code] ? t(known[code]) : t('ui.backendMessage', {message});
}
