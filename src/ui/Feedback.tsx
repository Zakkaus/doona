import {useContext, useEffect, useState, type CSSProperties, type ReactNode} from 'react';
import {
  Button as RButton,
  UNSTABLE_Toast as RToast,
  UNSTABLE_ToastContent as ToastContent,
  UNSTABLE_ToastList as ToastList,
  UNSTABLE_ToastQueue as ToastQueue,
  UNSTABLE_ToastRegion as ToastRegion,
  UNSTABLE_ToastStateContext as ToastStateContext,
  Text,
  type ToastState
} from 'react-aria-components';
import Close from './icons/Close';
import CheckmarkCircle from './icons/CheckmarkCircle';
import AlertTriangle from './icons/AlertTriangle';
import InfoCircle from './icons/InfoCircle';
import {readLang, translate, useT} from '../i18n';
import {ApiError, LocalError} from '../api/error';
import {cx} from './cx';
import {Button, TextTooltip} from './Button';

export function Empty({children}: {children: ReactNode}) {
  return <div className="rp-empty">{children}</div>;
}

export function Loading({children}: {children?: ReactNode}) {
  const t = useT();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(timer);
  }, []);
  return visible ? (
    <div className="rp-empty" role="status">
      <span className="rp-spinner" aria-hidden="true" />
      {children ?? t('ui.loading')}
    </div>
  ) : null;
}

export function errorText(error: unknown) {
  if (error instanceof LocalError) {
    const text = translate(readLang(), error.key);
    return error.detail ? `${text}: ${error.detail}` : text;
  }
  const message = error instanceof Error ? error.message : String(error);
  return error instanceof ApiError && error.requestId ? `${message} · request_id: ${error.requestId}` : message;
}

// Retry refetches the failed resource rather than reloading the page.
export function ErrorMessage({error, onRetry}: {error: Error | null | undefined; onRetry?: () => void}) {
  const t = useT();
  return error ? (
    <p role="alert" className="rp-alert">
      {t('ui.loadFailed', {error: errorText(error)})}
      {onRetry && (
        <Button small quiet onPress={onRetry}>
          {t('ui.retry')}
        </Button>
      )}
    </p>
  ) : null;
}

export function Light({tone, children, small}: {tone: 'ok' | 'warn' | 'err' | 'info' | 'neutral' | 'muted'; children: ReactNode; small?: boolean}) {
  return (
    <span className={cx('rp-light', tone, small && 'sm')}>
      <span>{children}</span>
    </span>
  );
}
export function Bar({label, value, pct, color}: {label: ReactNode; value: string; pct: number; color: string}) {
  return (
    <div className="rp-bar">
      <div className="top">
        <span className="l">{typeof label === 'string' ? <TextTooltip>{label}</TextTooltip> : label}</span>
        <span className="v">{value}</span>
      </div>
      <div className="track" aria-hidden="true">
        <div className="fill" style={{width: `${Math.max(0, Math.min(100, pct))}%`, background: color}} />
      </div>
    </div>
  );
}

export function Badge({children, tone, className}: {children: ReactNode; tone?: 'warn'; className?: string}) {
  return <TextTooltip className={cx('rp-badge', tone, className)}>{children}</TextTooltip>;
}

// `row` keeps label and value on one line; a third element is the full value, shown as a tooltip.
export function Kv({items, inline, row}: {items: Array<[string, string] | [string, string, string]>; inline?: boolean; row?: boolean}) {
  return (
    <div className={cx('rp-kv', (inline || row) && 'inline', row && 'row')}>
      {items.map(([k, v, full]) => (
        <div key={k}>
          <span className="k">{k}</span>
          {full ? (
            <TextTooltip className="v" text={full}>
              {v}
            </TextTooltip>
          ) : (
            <span className="v">{v}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// Toasts: react-aria's queue rendered like S2's ToastContainer; timers pause while hovered, focused or listed.
type ToastKind = 'positive' | 'negative' | 'neutral' | 'info';
type ToastMessage = {kind: ToastKind; text: string};
const toasts = new ToastQueue<ToastMessage>({maxVisibleToasts: 5});
export const toast = (kind: ToastKind, text: string) => {
  toasts.add({kind, text}, {timeout: 5000});
};
const TOAST_ICON = {positive: CheckmarkCircle, negative: AlertTriangle, info: InfoCircle, neutral: null};
export function Toasts() {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (expanded) toasts.pauseAll();
    else toasts.resumeAll();
  }, [expanded]);
  // The list closes with its last toast; the region itself unmounts then.
  useEffect(
    () =>
      toasts.subscribe(() => {
        if (toasts.visibleToasts.length === 0) setExpanded(false);
      }),
    []
  );
  useEffect(() => {
    if (!expanded) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [expanded]);
  return (
    <ToastRegion queue={toasts} className={cx('rp-toasts', expanded && 'expanded')}>
      {expanded && <RButton className="rp-toast-underlay" aria-label={t('toast.collapse')} onPress={() => setExpanded(false)} />}
      {expanded && (
        <div className="rp-toast-controls">
          <RButton className="rp-btn sm" onPress={() => toasts.clear()}>
            {t('toast.clearAll')}
          </RButton>
          <RButton className="rp-btn sm" onPress={() => setExpanded(false)}>
            {t('toast.collapse')}
          </RButton>
        </div>
      )}
      <ToastStack expanded={expanded} onExpand={() => setExpanded(true)} />
    </ToastRegion>
  );
}
function ToastStack({expanded, onExpand}: {expanded: boolean; onExpand: () => void}) {
  const t = useT();
  const state = useContext(ToastStateContext) as ToastState<ToastMessage>;
  const visible = state.visibleToasts;
  return (
    <ToastList<ToastMessage> className="rp-toast-list">
      {({toast: item}) => {
        // The queue lists the newest first; behind it, the depth sets a toast's offset and scale.
        const depth = visible.indexOf(item);
        const background = !expanded && depth > 0;
        const Icon = TOAST_ICON[item.content.kind];
        return (
          <RToast
            toast={item}
            className={cx('rp-toast', item.content.kind, background && 'background')}
            style={{zIndex: visible.length - depth, '--i': Math.min(depth, 3)} as CSSProperties}
            inert={background || undefined}
          >
            <div className="main">
              <ToastContent className="body">
                {Icon && <Icon />}
                <Text slot="title" className="grow">
                  {item.content.text}
                </Text>
              </ToastContent>
              {!expanded && depth === 0 && visible.length > 1 && (
                <RButton className="rp-btn sm quiet more" onPress={onExpand}>
                  {t('toast.showAllCount', {n: visible.length})}
                </RButton>
              )}
            </div>
            <RButton slot="close" className="rp-btn quiet icon close" aria-label={t('close')}>
              <Close />
            </RButton>
          </RToast>
        );
      }}
    </ToastList>
  );
}
