import {useEffect, useMemo, useState} from 'react';
import type {DnsCacheList} from '../../api/model';
import type {Key} from '../../i18n';
import {dnsMatcher, type MatchKind} from './match';

type Entries = DnsCacheList['entries'];

export function useCacheMatches(entries: Entries | undefined, pattern: {kind: MatchKind; text: string}, type: string) {
  const candidates = useMemo(() => (entries ?? []).filter(entry => type === 'all' || entry.type === type), [entries, type]);
  const asynchronous = pattern.kind === 'regex' && !!pattern.text.trim();
  const [completed, setCompleted] = useState<{
    candidates: Entries;
    pattern: typeof pattern;
    matches: Entries;
    error?: Key;
  } | null>(null);
  useEffect(() => {
    if (!asynchronous) return;
    const worker = new Worker(new URL('./match.worker.ts', import.meta.url), {type: 'module'});
    let active = true;
    const finish = (indices: number[] | null, error?: Key) => {
      if (!active) return;
      active = false;
      clearTimeout(timer);
      worker.terminate();
      setCompleted({
        candidates,
        pattern,
        matches: indices?.map(index => candidates[index]) ?? [],
        error: error ?? (indices === null ? 'dns.invalidRegex' : undefined)
      });
    };
    // Termination bounds the entire batch, even when one name causes catastrophic backtracking.
    const timer = setTimeout(() => finish([], 'dns.regexTimeout'), 1000);
    worker.onmessage = (event: MessageEvent<number[] | null>) => finish(event.data);
    worker.onerror = event => {
      event.preventDefault();
      finish([], 'dns.matchFailed');
    };
    worker.postMessage({text: pattern.text, names: candidates.map(entry => entry.domain)});
    return () => {
      active = false;
      clearTimeout(timer);
      worker.terminate();
    };
  }, [asynchronous, candidates, pattern]);
  const synchronous = useMemo(() => {
    if (asynchronous) return null;
    const matcher = dnsMatcher(pattern.kind, pattern.text);
    return {matches: matcher ? candidates.filter(entry => matcher(entry.domain)) : [], error: matcher ? undefined : ('dns.invalidName' as const)};
  }, [asynchronous, candidates, pattern]);
  if (synchronous) return {...synchronous, pending: false};
  // Old results cannot enable deletion after the pattern, type or cache listing changes.
  const current = completed?.candidates === candidates && completed.pattern === pattern;
  return {matches: current ? completed.matches : [], error: current ? completed.error : undefined, pending: !current};
}
