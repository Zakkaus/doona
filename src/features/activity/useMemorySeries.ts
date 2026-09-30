import {useMemo} from 'react';
import type {Capabilities, RuntimeMemory} from '../../api/model';
import {useMemoryHistory} from '../../store';
import {offered} from '../../api/capabilities';
import {useRings} from '../../api/rings';
import {foldMemory, historySamples, memorySample, memoryWindow} from './memory';

export function useMemorySeries(capabilities: Capabilities | undefined, memory: RuntimeMemory | undefined) {
  const history = useMemoryHistory(capabilities);
  const rings = useRings('memory', memory, memorySample, foldMemory);
  const advertised = offered(capabilities?.resources, 'memory_history', {whileLoading: false});
  const windowSeconds = advertised ? history.windowSeconds : 600;
  const converted = useMemo(() => (history.data ? historySamples(history.data) : []), [history.data]);
  const series = useMemo(() => memoryWindow(rings, advertised ? converted : [], windowSeconds), [rings, converted, advertised, windowSeconds]);
  return {...series, error: advertised ? history.error : undefined, retry: history.refetch};
}
