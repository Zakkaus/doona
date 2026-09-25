import {wait} from './wait';

// A refusal waited out for longer than this is shown, so a request that seems stuck says why and for how long.
const NOTICE_SECONDS = 3;
export type Refusal = {status: number; until: number};
const waits = new Set<Refusal>();
const listeners = new Set<() => void>();
let shown: Refusal | null = null;
function publish() {
  shown = [...waits].reduce<Refusal | null>((last, entry) => (last && last.until >= entry.until ? last : entry), null);
  listeners.forEach(notify => notify());
}
export const currentRefusal = () => shown;
export function subscribeRefusal(notify: () => void) {
  listeners.add(notify);
  return () => void listeners.delete(notify);
}
export async function waitOutRefusal(status: number, seconds: number, signal?: AbortSignal) {
  if (seconds <= NOTICE_SECONDS) return wait(seconds, signal);
  const entry = {status, until: Date.now() + seconds * 1000};
  waits.add(entry);
  publish();
  try {
    await wait(seconds, signal);
  } finally {
    waits.delete(entry);
    publish();
  }
}
