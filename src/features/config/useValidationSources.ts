import {useMemo} from 'react';
import type {ConfigSource} from '../../api/model';
import {validationSources} from './names';

export function useValidationSources(
  sources: ConfigSource[],
  isComplete: (source: ConfigSource) => boolean | undefined,
  replacement?: {id: string; content: string}
) {
  const id = replacement?.id;
  const content = replacement?.content;
  return useMemo(() => {
    const authored = sources.filter(source => source.kind === 'main' || source.kind === 'include');
    if (authored.some(source => isComplete(source) === undefined)) return null;
    return validationSources(
      authored.filter(source => isComplete(source)),
      id !== undefined && content !== undefined ? {id, content} : undefined
    );
  }, [sources, isComplete, id, content]);
}
