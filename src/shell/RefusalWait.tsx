import {useEffect, useState, useSyncExternalStore} from 'react';
import {useT} from '../i18n';
import {InlineAlert} from '../ui/ui';
import {currentRefusal, subscribeRefusal, type Refusal} from '../api/refusal';

// A request the backend asked to wait on: why, and a countdown to the automatic retry.
export function RefusalWait() {
  const refusal = useSyncExternalStore(subscribeRefusal, currentRefusal);
  return refusal && <Countdown key={refusal.until} {...refusal} />;
}
function Countdown({status, until}: Refusal) {
  const t = useT();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <InlineAlert tone="informative">
      {t(status === 429 ? 'shell.rateLimited' : 'shell.backendBusy', {n: Math.max(1, Math.ceil((until - now) / 1000))})}
    </InlineAlert>
  );
}
