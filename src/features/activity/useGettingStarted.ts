import {useEffect, useState} from 'react';
import {useCapabilities, useConfig, useGroups, useNodes, useProviders} from '../../store';
import {offered} from '../../api/capabilities';
import {storageKeys} from '../../api/storage';
import {setupCompletion} from './gettingStarted';

type Stopped = 'complete' | 'dismissed';
let sessionState: Stopped | null = null;
function readState(): Stopped | null {
  if (sessionState) return sessionState;
  try {
    const saved = localStorage.getItem(storageKeys.gettingStarted);
    return saved === 'complete' || saved === 'dismissed' ? saved : null;
  } catch {
    return null;
  }
}
function saveState(state: Stopped) {
  sessionState = state;
  try {
    if (localStorage.getItem(storageKeys.gettingStarted) !== state) localStorage.setItem(storageKeys.gettingStarted, state);
  } catch {}
}

export function useGettingStarted() {
  const [stopped, setStopped] = useState(readState);
  const resources = useCapabilities().data?.resources;
  const nodes = useNodes(!stopped && offered(resources, 'nodes', {whileLoading: false}));
  const providers = useProviders(!stopped && offered(resources, 'providers', {whileLoading: false}));
  const config = useConfig(!stopped && offered(resources, 'config', {whileLoading: false}));
  const groups = useGroups(!stopped && offered(resources, 'groups', {whileLoading: false}));
  const done = stopped
    ? {nodes: true, rules: true, connection: true}
    : setupCompletion(nodes.data ?? [], config.data?.sources ?? [], groups.data ?? [], providers.data?.providers ?? []);
  const ready = !!nodes.data && !!providers.data && !!config.data && !!groups.data;
  const supported = (['nodes', 'providers', 'config', 'groups'] as const).every(resource => offered(resources, resource, {whileLoading: false}));
  const failed = !!(nodes.error || providers.error || config.error || groups.error);
  const complete = ready && Object.values(done).every(Boolean);
  useEffect(() => {
    if (stopped || !complete) return;
    const frame = requestAnimationFrame(() => {
      saveState('complete');
      setStopped('complete');
    });
    return () => cancelAnimationFrame(frame);
  }, [stopped, complete]);
  return {
    done,
    pending: !stopped && supported && !ready && !failed,
    visible: !stopped && ready && !complete,
    // Finished or dismissed before: the card cannot appear above the dashboard.
    settled: !!stopped,
    dismiss: () => {
      saveState('dismissed');
      setStopped('dismissed');
    }
  };
}
