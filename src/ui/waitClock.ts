const SHOW_AFTER = 150;
const PHASE_GAP = 100;

// A wait is the run of loading states that follow one another, each mounting while an earlier one is showing or just
// went (startup, the page's code, its first reads), and it has one clock. It begins with the first state and ends once
// nothing has waited for PHASE_GAP. A key names whose wait it is: a route's, so a page opened later or a widget beside
// it starts a clock of its own.
type Clock = {began: number; waiters: number; ended?: ReturnType<typeof setTimeout>};
const clocks = new Map<string, Clock>();

// Whether a state joining now shows at once, because the wait it joins has already run its delay.
export function overdue(key: string): boolean {
  const clock = clocks.get(key);
  return clock !== undefined && performance.now() - clock.began >= SHOW_AFTER;
}

// Joins the wait and calls `show` once its delay is over; the returned function leaves it.
export function joinWait(key: string, show: () => void): () => void {
  const clock = clocks.get(key) ?? {began: performance.now(), waiters: 0};
  clocks.set(key, clock);
  clearTimeout(clock.ended);
  clock.waiters++;
  const timer = setTimeout(show, Math.max(0, clock.began + SHOW_AFTER - performance.now()));
  return () => {
    clearTimeout(timer);
    if (!--clock.waiters) clock.ended = setTimeout(() => clocks.delete(key), PHASE_GAP);
  };
}
