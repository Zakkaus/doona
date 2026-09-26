import {useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode} from 'react';
import {
  Button as RButton,
  UNSTABLE_Toast as RToast,
  UNSTABLE_ToastContent as ToastContent,
  UNSTABLE_ToastList as ToastList,
  UNSTABLE_ToastQueue as ToastQueue,
  UNSTABLE_ToastRegion as ToastRegion,
  UNSTABLE_ToastStateContext as ToastStateContext,
  Text,
  type QueuedToast,
  type ToastState
} from 'react-aria-components';
import Close from './icons/Close';
import CheckmarkCircle from './icons/CheckmarkCircle';
import AlertTriangle from './icons/AlertTriangle';
import InfoCircle from './icons/InfoCircle';
import ChevronDown from './icons/ChevronDown';
import {useT, type Translator} from '../i18n';
import {errorText, failureNotice, withoutRequestNote} from '../api/error';
import {cx} from './cx';
import {Button, TextTooltip} from './Button';
import {escapeLayers} from './hooks';

export function Empty({role, children}: {role?: 'alert'; children: ReactNode}) {
  return (
    <div className="rp-empty" role={role}>
      {children}
    </div>
  );
}

export function Loading({children}: {children?: ReactNode}) {
  const t = useT();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="rp-empty" role="status" data-wait={visible ? undefined : ''}>
      <span className="rp-spinner" aria-hidden="true" />
      {children ?? t('ui.loading')}
    </div>
  );
}

// A message about a whole form or view, as S2's InlineAlert: a negative one takes focus when it appears after a
// submit, so the result is announced where the person is looking.
export function InlineAlert({
  tone = 'negative',
  title,
  children,
  action,
  takeFocus
}: {
  tone?: 'negative' | 'informative';
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

// Retry refetches the failed resource rather than reloading the page.
// `message` replaces the load-failure wording for a failed action.
export function ErrorMessage({error, onRetry, message}: {error: Error | null | undefined; onRetry?: () => void; message?: string}) {
  const t = useT();
  return error ? (
    <InlineAlert
      action={
        onRetry && (
          <Button small quiet onPress={onRetry}>
            {t('ui.retry')}
          </Button>
        )
      }
    >
      {message ?? t('ui.loadFailed', {error: errorText(error, t)})}
    </InlineAlert>
  ) : null;
}

// Without children the light is the dot alone, for a place that names the state elsewhere.
export function Light({tone, children, small}: {tone: 'ok' | 'warn' | 'err' | 'info' | 'neutral' | 'muted'; children?: ReactNode; small?: boolean}) {
  return <span className={cx('rp-light', tone, small && 'sm')}>{children != null && <span>{children}</span>}</span>;
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

export function Badge({children, tone, className, tip}: {children: ReactNode; tone?: 'warn'; className?: string; tip?: string}) {
  return (
    <TextTooltip className={cx('rp-badge', tone, className)} text={tip}>
      {children}
    </TextTooltip>
  );
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
// A button in the toast, as S2's actionLabel / onAction / shouldCloseOnAction. A toast with one stays until closed:
// the person needs time to reach the button (WCAG 2.2.1).
type ToastAction = {label: string; onAction: () => void; closeOnAction?: boolean};
// The detail is a second, smaller line under the message: what went wrong, in the backend's words.
type ToastOptions = {detail?: string; action?: ToastAction};
type ToastMessage = {kind: ToastKind; text: string; detail?: string; action?: ToastAction};
const toasts = new ToastQueue<ToastMessage>({maxVisibleToasts: 5});
// A repeated message replaces its earlier copy at the front instead of stacking behind it.
const queued = new Map<string, string>();
// A toast leaves the request id out of its words and logs the failure with it instead, where a bug report can find it.
export const toast = (kind: ToastKind, fullText: string, {detail: fullDetail, action}: ToastOptions = {}) => {
  const text = withoutRequestNote(fullText);
  const detail = fullDetail && withoutRequestNote(fullDetail);
  if (text !== fullText || detail !== fullDetail) console.warn(fullDetail ? `${fullText}\n${fullDetail}` : fullText);
  const id = [kind, text, detail ?? ''].join('\n');
  const earlier = queued.get(id);
  if (earlier) toasts.close(earlier);
  const key = toasts.add(
    {kind, text, detail, action},
    {
      timeout: action ? undefined : 5000,
      onClose: () => {
        if (queued.get(id) === key) queued.delete(id);
      }
    }
  );
  queued.set(id, key);
};
// A failed action's toast; `wrap` words the failure. An unknown operation outcome is shown on its own, neutrally.
export const toastFailure = (error: unknown, t: Translator, wrap: (error: string) => string, action?: ToastAction) => {
  const notice = failureNotice(error, t, wrap);
  toast(notice.kind, notice.text, {action});
};
const TOAST_ICON = {positive: CheckmarkCircle, negative: AlertTriangle, info: InfoCircle, neutral: null};
// S2's ToastContainer placements: the edge the toasts stack from, then an optional end alignment.
export type ToastPlacement = 'top' | 'top end' | 'bottom' | 'bottom end';
export function Toasts({placement = 'bottom'}: {placement?: ToastPlacement}) {
  const [edge, align = 'center'] = placement.split(' ') as ['top' | 'bottom', 'end' | undefined];
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
    // One Escape closes one layer: an open dialog takes it unless focus is in the toasts themselves.
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const inToasts = (e.target as Element | null)?.closest?.('.rp-toasts');
      if (inToasts || !document.querySelector(escapeLayers)) setExpanded(false);
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [expanded]);
  return (
    <ToastRegion queue={toasts} className={cx('rp-toasts', expanded && 'expanded')} data-placement={edge} data-align={align}>
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
      <ToastStack expanded={expanded} edge={edge} onExpand={() => setExpanded(true)} />
    </ToastRegion>
  );
}
function ToastStack({expanded, edge, onExpand}: {expanded: boolean; edge: 'top' | 'bottom'; onExpand: () => void}) {
  const state = useContext(ToastStateContext) as ToastState<ToastMessage>;
  const visible = state.visibleToasts;
  return (
    <ToastList<ToastMessage> className="rp-toast-list">
      {({toast: item}) => {
        // The queue lists the newest first; behind it, the depth sets a toast's offset and scale.
        const depth = visible.indexOf(item);
        return (
          <ToastItem
            item={item}
            state={state}
            depth={depth}
            count={visible.length}
            background={!expanded && depth > 0}
            more={!expanded && depth === 0 && visible.length > 1 ? {edge, onExpand} : null}
          />
        );
      }}
    </ToastList>
  );
}
// One toast, after S2's with the message in two levels: the icon, the summary with its detail below, and close on the
// first line; under them, only when there is one, a row with "show all" at the start and the action at the end, which
// ends where close ends. The same on a phone.
function ToastItem({
  item,
  state,
  depth,
  count,
  background,
  more
}: {
  item: QueuedToast<ToastMessage>;
  state: ToastState<ToastMessage>;
  depth: number;
  count: number;
  background: boolean;
  more: {edge: 'top' | 'bottom'; onExpand: () => void} | null;
}) {
  const t = useT();
  const Icon = TOAST_ICON[item.content.kind];
  const {text, detail, action} = item.content;
  return (
    <RToast
      toast={item}
      className={cx('rp-toast', item.content.kind, background && 'background')}
      style={{zIndex: count - depth, '--i': Math.min(depth, 3)} as CSSProperties}
      inert={background || undefined}
    >
      <ToastContent className="body">
        {Icon && (
          <span className="icon">
            <Icon />
          </span>
        )}
        <div className="msg">
          <Text slot="title" elementType="div" className="summary">
            {text}
          </Text>
          {detail && (
            <Text slot="description" elementType="div" className="detail">
              {detail}
            </Text>
          )}
        </div>
      </ToastContent>
      <RButton slot="close" className="rp-btn quiet icon close" aria-label={t('close')}>
        <Close />
      </RButton>
      {(more || action) && (
        <div className="foot">
          {more && (
            <RButton className="rp-btn sm quiet more" onPress={more.onExpand}>
              <ChevronDown className={cx(more.edge === 'bottom' && 'up')} />
              {t('toast.showAllCount', {n: count})}
            </RButton>
          )}
          {action && (
            <RButton
              className="rp-btn action"
              onPress={() => {
                action.onAction();
                if (action.closeOnAction) state.close(item.key);
              }}
            >
              {action.label}
            </RButton>
          )}
        </div>
      )}
    </RToast>
  );
}
