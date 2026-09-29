import type {ProbeResult} from '../../api/model';
import {foldFamilies} from '../../api/selectors';
import {millis} from '../../api/u64';
import type {Translator} from '../../i18n';
import {backendCode, knownCode} from '../../i18n/backend';

// The node's rows fold as the latency column folds them: one answering family makes it available, and a probe that
// could not tell (timed out, or its cleanup failed) is not a node that is down. A reason the UI has no words for is
// left out rather than shown as a bare code.
export function probeToast(result: ProbeResult, id: string, name: string, t: Translator) {
  const items = result.results.filter(item => item.member_id === id);
  const row = foldFamilies(items);
  if (row?.state === 'healthy' && row.latency_ms != null) return {kind: 'positive' as const, text: t('nodes.probed', {name, n: millis(row.latency_ms)})};
  if (row?.state === 'unavailable') return {kind: 'negative' as const, text: t('nodes.probeFailed', {name})};
  const error = items.find(item => item.error && knownCode(item.error))?.error;
  return {kind: 'neutral' as const, text: error ? t('nodes.probeUnknownWhy', {name, error: backendCode(error, t)}) : t('nodes.probeUnknown', {name})};
}
