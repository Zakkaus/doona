import {useMemo} from 'react';
import type {Capabilities, RuntimeMemory} from '../../api/model';
import {useMemoryHistory} from '../../store';
import {historySamples, memoryWindow, useMemorySamples} from './memory';

export function useMemorySeries(capabilities: Capabilities | undefined, memory: RuntimeMemory | undefined) {
  const history = useMemoryHistory(capabilities);
  const rings = useMemorySamples(memory);
  const advertised = capabilities?.resources.memory_history.available === true;
  const windowSeconds = advertised ? Math.min(600, capabilities.resources.memory_history.max_window_seconds ?? 600) : 600;
  const converted = useMemo(() => (history.data ? historySamples(history.data) : []), [history.data]);
  const series = useMemo(() => memoryWindow(rings, advertised ? converted : [], windowSeconds), [rings, converted, advertised, windowSeconds]);
  return {...series, error: advertised ? history.error : undefined};
}
