// The host's clock, for comparing against the timestamps it sends. A router without an RTC can run minutes off until
// NTP syncs, and relative times or chart windows taken from the browser clock would then be wrong. A response's
// observed_at is never later than the host's time on arrival, so the largest recent offset is the closest. A reading
// expires a minute before the newest one, so a corrected host clock is followed; while no response arrives, the last
// estimate stands. Skews of a few seconds are left alone.
const tolerance = 5000;
const span = 60_000;
let readings: Array<{at: number; offset: number}> = [];

export function noteServerTime(observedAt: unknown, receivedAt = Date.now()) {
  const time = typeof observedAt === 'string' ? Date.parse(observedAt) : NaN;
  if (!Number.isFinite(time)) return;
  readings = readings.filter(reading => receivedAt - reading.at < span);
  readings.push({at: receivedAt, offset: time - receivedAt});
}

export function serverNow(now = Date.now()) {
  const offset = Math.max(...readings.map(reading => reading.offset));
  return Number.isFinite(offset) && Math.abs(offset) > tolerance ? now + offset : now;
}

// A different backend has its own clock.
export function resetServerClock() {
  readings = [];
}
