import {useEffect, useState, useSyncExternalStore} from 'react';
import {VisuallyHidden} from 'react-aria';
import {useT} from '../i18n';
import {InlineAlert} from '../ui/ui';
import {currentRefusal, subscribeRefusal, type Refusal} from '../api/refusal';

// A request the backend asked to wait on: why, and a countdown to the automatic retry.
export function RefusalWait() {
  const refusal = useSyncExternalStore(subscribeRefusal, currentRefusal);
  return refusal && <Countdown key={refusal.until} {...refusal} />;
}
// The alert is a live region: screen readers hear the wait once, as it stood when it began, and only the visible
// number ticks.
function Countdown({status, until}: Refusal) {
  const t = useT();
  const [start] = useState(Date.now);
  const [now, setNow] = useState(start);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const text = (at: number) => t(status === 429 ? 'shell.rateLimited' : 'shell.backendBusy', {n: Math.max(1, Math.ceil((until - at) / 1000))});
  return (
    <InlineAlert tone="informative">
      <span aria-hidden="true">{text(now)}</span>
      <VisuallyHidden>{text(start)}</VisuallyHidden>
    </InlineAlert>
  );
}
