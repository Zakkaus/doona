import {useMemo} from 'react';
import type {Capabilities, RuntimeMemory} from '../../api/model';
import {useMemoryHistory} from '../../api/store';
import {historySamples, memoryWindow, useMemorySamples} from './memory';

export function useMemorySeries(capabilities: Capabilities | undefined, memory: RuntimeMemory | undefined, windowSeconds: number) {
  const history = useMemoryHistory(capabilities);
  const rings = useMemorySamples(memory);
  const advertised = capabilities?.resources.memory_history.available === true;
  const converted = useMemo(() => (history.data ? historySamples(history.data) : []), [history.data]);
  const series = useMemo(() => memoryWindow(rings, advertised ? converted : [], windowSeconds), [rings, converted, advertised, windowSeconds]);
  return {...series, loading: advertised && !history.data && history.loading, error: advertised ? history.error : undefined};
}
