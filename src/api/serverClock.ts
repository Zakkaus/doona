// The host's clock, for comparing against the timestamps it sends. A router without an RTC can run minutes off until
// NTP syncs, and relative times or chart windows taken from the browser clock would then be wrong. A response's
// observed_at is never later than the host's time on arrival, so the largest recent offset is the closest. Readings
// age out a minute before the newest one, so a corrected host clock is followed; while no response arrives, the last
// estimate stands. A shift starts above a few seconds of skew and stops below half that, so it does not flap.
const tolerance = 5000;
const span = 60_000;

export type ServerClock = {
  note(observedAt: unknown, receivedAt?: number): void;
  now(now?: number): number;
};

export function createServerClock(): ServerClock {
  let readings: Array<{at: number; offset: number}> = [];
  let offset = 0;
  return {
    note(observedAt, receivedAt = Date.now()) {
      const time = typeof observedAt === 'string' ? Date.parse(observedAt) : NaN;
      if (!Number.isFinite(time)) return;
      readings = readings.filter(reading => receivedAt - reading.at < span);
      readings.push({at: receivedAt, offset: time - receivedAt});
      const latest = Math.max(...readings.map(reading => reading.offset));
      offset = Math.abs(latest) > (offset ? tolerance / 2 : tolerance) ? latest : 0;
    },
    now: (now = Date.now()) => now + offset
  };
}

// Each backend has its own clock; the one in use is the one relative times and chart windows read.
let active = createServerClock();

export function selectServerClock(clock: ServerClock) {
  active = clock;
}

export function serverNow(now?: number) {
  return active.now(now);
}
