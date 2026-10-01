import type {RuntimeSettings} from '../model';

type Recorder = 'flows' | 'logs' | 'dns_log';
type Attachment = Recorder | 'events';
const recorders: Recorder[] = ['flows', 'logs', 'dns_log'];
// honk keeps each demand for 60 seconds; settings/view.ts describes the same grace.
const grace = 60 * 1000;

// Event attachment and each diagnostic recorder have independent demand and grace.
export function createRecording(settings: RuntimeSettings) {
  const demand: Record<Attachment, {clients: number; until: number}> = {
    events: {clients: 0, until: 0},
    flows: {clients: 0, until: 0},
    logs: {clients: 0, until: 0},
    dns_log: {clients: 0, until: 0}
  };
  const active = (key: Attachment) => demand[key].clients > 0 || demand[key].until > Date.now();
  const refresh = () => {
    const recording = settings.recording;
    if (!recording) return;
    for (const key of recorders) {
      const state = recording[key];
      if (state) state.active = state.allowed && (state.mode === 'on' || (state.mode === 'auto' && active(key)));
    }
    if (recording.events) recording.events.active = active('events') || recorders.some(key => recording[key]?.allowed && recording[key]?.mode === 'on');
    recording.grace_remaining_seconds = demand.events.clients ? 0 : Math.max(0, Math.ceil((demand.events.until - Date.now()) / 1000));
  };
  const renew = (key: Recorder) => {
    demand.events.until = demand[key].until = Date.now() + grace;
    refresh();
  };
  const attach = (key?: Recorder) => {
    const keys: Attachment[] = key ? ['events', key] : ['events'];
    for (const item of keys) demand[item].clients++;
    refresh();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (const item of keys) {
        demand[item].clients--;
        if (!demand[item].clients) demand[item].until = Date.now() + grace;
      }
      refresh();
    };
  };
  return {refresh, renew, attach};
}
export type MockRecording = ReturnType<typeof createRecording>;
