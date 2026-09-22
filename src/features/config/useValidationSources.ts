import {useEffect, useMemo, useState} from 'react';
import type {ConfigSource} from '../../api/model';
import {completeSource} from '../../store/config';
import {validationSources} from './names';

export function useValidationSources(sources: ConfigSource[], replacement?: {id: string; content: string}) {
  const [checked, setChecked] = useState<{sources: ConfigSource[]; complete: ConfigSource[]} | null>(null);
  useEffect(() => {
    let live = true;
    const authored = sources.filter(source => source.kind === 'main' || source.kind === 'include');
    void Promise.all(authored.map(completeSource)).then(results => {
      if (live) setChecked({sources, complete: authored.filter((_, index) => results[index])});
    });
    return () => {
      live = false;
    };
  }, [sources]);
  const id = replacement?.id;
  const content = replacement?.content;
  return useMemo(
    () => (checked?.sources === sources ? validationSources(checked.complete, id !== undefined && content !== undefined ? {id, content} : undefined) : null),
    [checked, sources, id, content]
  );
}
