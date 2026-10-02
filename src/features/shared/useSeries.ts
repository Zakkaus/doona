import {useContext, useMemo} from 'react';
import type {Capabilities, Runtime, RuntimeMemory} from '../../api/model';
import {ResourcePreview} from '../../store/preview';
import {useMemoryHistory, useTrafficHistory} from '../../store';
import {offered} from '../../api/capabilities';
import {useRings} from '../../api/rings';
import {foldMemory, historySamples, memorySample, memoryWindow} from './memory';
import {foldTraffic, historyTrafficSamples, trafficSample, trafficWindow} from './traffic';

// The history charts' series: the backend's history joined with the session's own polls, over `windowSeconds`. A
// preview draws from its samples alone and polls nothing; `anchored` ends the window at the last history sample
// instead of now, so a sample preview stays filled.
type SeriesOptions = {enabled?: boolean; windowSeconds?: number; anchored?: boolean};

export function useTrafficSeries(
  capabilities: Capabilities | undefined,
  runtime: Runtime | undefined,
  windowSeconds: number,
  {enabled = true, anchored = false}: SeriesOptions = {}
) {
  const preview = useContext(ResourcePreview);
  const history = useTrafficHistory(windowSeconds, enabled ? capabilities : undefined);
  const rings = useRings('traffic', preview || !enabled ? undefined : runtime, trafficSample, foldTraffic, enabled, preview);
  const samples = useMemo(() => (history.data ? historyTrafficSamples(history.data) : []), [history.data]);
  const series = useMemo(
    () => trafficWindow(rings, samples, windowSeconds, anchored ? samples.at(-1)?.time : undefined),
    [rings, samples, windowSeconds, anchored]
  );
  return {history, rings, samples, series};
}

export function useMemorySeries(
  capabilities: Capabilities | undefined,
  memory: RuntimeMemory | undefined,
  {enabled = true, windowSeconds, anchored = false}: SeriesOptions = {}
) {
  const preview = useContext(ResourcePreview);
  const history = useMemoryHistory(enabled ? capabilities : undefined);
  const rings = useRings('memory', preview ? undefined : memory, memorySample, foldMemory, enabled, preview);
  const advertised = offered(capabilities?.resources, 'memory_history', {whileLoading: false});
  const seconds = windowSeconds ?? (advertised ? history.windowSeconds : 600);
  const converted = useMemo(() => (history.data && advertised ? historySamples(history.data) : []), [history.data, advertised]);
  const series = useMemo(() => memoryWindow(rings, converted, seconds, anchored ? converted.at(-1)?.time : undefined), [rings, converted, seconds, anchored]);
  return {...series, error: advertised ? history.error : undefined, retry: history.refetch};
}
