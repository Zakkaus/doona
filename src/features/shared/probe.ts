import type {ProbeResult} from '../../api/model';
import {millis} from '../../api/u64';
import type {Translator} from '../../i18n';

// A probe that could not tell (timed out, or its cleanup failed) is not a node that is down.
export function probeToast(result: ProbeResult, id: string, name: string, t: Translator) {
  const items = result.results.filter(item => item.member_id === id);
  const sample = items.find(item => item.state === 'healthy' && item.latency_ms != null);
  if (sample) return {kind: 'positive' as const, text: t('nodes.probed', {name, n: millis(sample.latency_ms!)})};
  if (items.length && items.every(item => item.state === 'unavailable')) return {kind: 'negative' as const, text: t('nodes.probeFailed', {name})};
  const error = items.find(item => item.error)?.error;
  return {kind: 'neutral' as const, text: error ? t('nodes.probeUnknownWhy', {name, error}) : t('nodes.probeUnknown', {name})};
}
