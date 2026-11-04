import type {Provider} from '../../../src/api/model';
import type {Messages} from './i18n/en';

// The stages honk names in details.stage of a fetch_failed, as the root app words them in ui.backend.
const stages = {
  connection_failed: 'fetchStageConnection',
  download_timeout: 'fetchStageTimeout',
  tls_failed: 'fetchStageTls',
  http_status_rejected: 'fetchStageHttpStatus',
  http_not_found: 'fetchStageNotFound',
  route_blocked: 'fetchStageRouteBlocked',
  asset_too_large: 'fetchStageTooLarge',
  parse_failed: 'fetchStageParse'
} as const satisfies Record<string, keyof Messages>;

// Why a subscription's last update failed, in the interface language. An engine that sends no stage gets the plain
// fetch_failed text; a code the page does not know keeps the engine's own message.
export function fetchFailureText(error: NonNullable<Provider['last_error']>, t: Messages): string {
  if (error.code === 'route_unavailable') return t.routeUnavailable;
  if (error.code !== 'fetch_failed') return error.message;
  const stage = (error.details as {stage?: unknown} | null | undefined)?.stage;
  return typeof stage === 'string' && Object.hasOwn(stages, stage) ? t[stages[stage as keyof typeof stages]] : t.fetchFailed;
}
