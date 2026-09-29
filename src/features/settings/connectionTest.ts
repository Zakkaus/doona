import {useCallback, useEffect, useRef, useState} from 'react';
import type {Key, Params} from '../../i18n';
import {createApi} from '../../api/client';
import {ApiError} from '../../api/error';
import {probeFailure} from './view';

export type ProbeOutcome = {version: string; password: boolean} | {failure: {key: Key; params?: Params}; requestId: string | null};

// Reads the backend's discovery: its API version and sign-in mode, or why they could not be read. Null when the
// test was cancelled rather than timed out.
export async function probeBackend(base: string, token: string, signal: AbortSignal, origin: string): Promise<ProbeOutcome | null> {
  try {
    const discovery = await createApi(base, token).discovery(signal);
    if (!discovery || !Number.isInteger(discovery.api_major) || discovery.api_major < 1) {
      throw new ApiError(200, 'invalid_discovery', 'Missing API version');
    }
    return {version: String(discovery.api_major), password: discovery.auth.mode === 'password'};
  } catch (error) {
    const failure = probeFailure(error, signal, base, origin, token);
    return failure && {failure, requestId: error instanceof ApiError ? error.requestId : null};
  }
}

// One connection test at a time, given five seconds. `cancel` drops the test in flight, as leaving the page does;
// a dropped test reports nothing.
export function useConnectionTest() {
  const [pending, setPending] = useState(false);
  const request = useRef<AbortController | null>(null);
  const abort = useCallback(() => {
    const controller = request.current;
    request.current = null;
    controller?.abort();
  }, []);
  useEffect(() => abort, [abort]);
  const cancel = useCallback(() => {
    abort();
    setPending(false);
  }, [abort]);
  const run = async (base: string, token: string, settle: (outcome: ProbeOutcome) => void) => {
    const controller = new AbortController();
    request.current = controller;
    const timer = setTimeout(() => controller.abort(new DOMException('Connection timeout', 'TimeoutError')), 5000);
    setPending(true);
    try {
      const outcome = await probeBackend(base, token, controller.signal, location.origin);
      if (outcome && request.current === controller) settle(outcome);
    } finally {
      clearTimeout(timer);
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    }
  };
  return {pending, running: () => request.current !== null, cancel, run};
}
