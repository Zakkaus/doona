import {useEffect, useRef, useState, type ReactNode} from 'react';
import {useT} from '../i18n';
import {errorLines} from '../api/error';
import {cx} from './cx';
import {Button} from './Button';

// A message about a whole form or view, as S2's InlineAlert: a negative one takes focus when it appears after a
// submit, so the result is announced where the person is looking.
export function InlineAlert({
  tone = 'negative',
  title,
  children,
  action,
  takeFocus
}: {
  tone?: 'negative' | 'notice' | 'informative';
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  takeFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (takeFocus) ref.current?.focus();
  }, [takeFocus]);
  return (
    <div ref={ref} role={tone === 'negative' ? 'alert' : 'status'} tabIndex={takeFocus ? -1 : undefined} className={cx('rp-alert', tone)}>
      {title && <strong className="rp-alert-title">{title}</strong>}
      <span>{children}</span>
      {action}
    </div>
  );
}

// A form's refusal or unconfirmed outcome: a neutral one is information, not an error. The caller keys it by `id`,
// which moves focus to it again.
export type Problem = {id: number; text: string; kind?: 'neutral' | 'negative'};
export function ProblemAlert({problem}: {problem: Problem}) {
  return (
    <InlineAlert tone={problem.kind === 'neutral' ? 'informative' : 'negative'} takeFocus>
      {problem.text}
    </InlineAlert>
  );
}

// Retry refetches the failed resource rather than reloading the page.
// `message` words the error for a failed action instead of as a load failure; the backend's detail goes below it.
export function ErrorMessage({error, onRetry, message}: {error: Error | null | undefined; onRetry?: () => unknown; message?: (error: string) => string}) {
  const t = useT();
  // A retry is a refetch: Retry stays pending until it settles, whatever it returns.
  const [retrying, setRetrying] = useState(false);
  if (!error) return null;
  const retry = async () => {
    setRetrying(true);
    try {
      await onRetry?.();
    } catch {
      // The refetch reports its own failure through the error this alert shows.
    } finally {
      setRetrying(false);
    }
  };
  const {summary, detail} = errorLines(error, t);
  return (
    <InlineAlert
      action={
        onRetry && (
          <Button small quiet isPending={retrying} onPress={() => void retry()}>
            {t('ui.retry')}
          </Button>
        )
      }
    >
      {message ? message(summary) : t('ui.loadFailed', {error: summary})}
      {detail && <span className="rp-alert-detail">{detail}</span>}
    </InlineAlert>
  );
}
