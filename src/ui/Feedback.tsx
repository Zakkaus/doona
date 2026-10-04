import {useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode} from 'react';
import {
  Button as RButton,
  Label,
  Meter as RMeter,
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
import {errorLines, errorText, failureNotice, requestIdOf} from '../api/error';
import {recordDiagnostic, type Diagnostic} from '../api/diagnostics';
import {cx} from './cx';
import {Button} from './Button';
import {TextTooltip} from './Tooltip';
import {escapeLayers} from './hooks';

export function Empty({role, children}: {role?: 'alert'; children: ReactNode}) {
  return (
    <div className="rp-empty" role={role}>
      {children}
    </div>
  );
}

// Holds a chart's or a card body's height while its data arrives or when there is none, so the card does not jump;
// `holds` names the body it stands in for, which sets the height (see cards-dashboard.css).
export function ChartWait({holds, children}: {holds?: 'tall' | 'bars' | 'form' | 'ops'; children: ReactNode}) {
  return <div className={cx('rp-chart-wait', holds)}>{children}</div>;
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
export function ErrorMessage({error, onRetry, message}: {error: Error | null | undefined; onRetry?: () => void; message?: (error: string) => string}) {
  const t = useT();
  if (!error) return null;
  const {summary, detail} = errorLines(error, t);
  return (
    <InlineAlert
      action={
        onRetry && (
          <Button small quiet onPress={onRetry}>
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

// S2's Meter: a quantity within a known range, such as space used against a limit, with its label and value above the
// track. The value's text is also what assistive technology reads. `tone` colours the fill as the light's tones do: ok
// is S2's informative accent, warn its notice and err its negative variant. M is the default; S, for a small card, takes
// S2's small field label (12px, subdued) and its 4px track.
export function Meter({
  label,
  value,
  valueLabel,
  tone = 'ok',
  size
}: {
  label: string;
  value: number;
  valueLabel: string;
  tone?: 'ok' | 'warn' | 'err';
  size?: 'S' | 'M';
}) {
  return (
    <RMeter className={cx('rp-meter', tone)} data-size={size === 'S' ? 'S' : undefined} value={value} valueLabel={valueLabel}>
      {({percentage}) => (
        <>
          <span className="top">
            <Label className="l">{label}</Label>
            <span className="v">{valueLabel}</span>
          </span>
          <MeterTrack percentage={percentage} />
        </>
      )}
    </RMeter>
  );
}
// A meter's track filled to `percentage`, for a meter that lays out its own label and value, such as a fact's.
export function MeterTrack({percentage}: {percentage: number}) {
  return (
    <span className="track">
      <span className="fill" style={{width: `${percentage}%`}} />
    </span>
  );
}

export function Badge({children, tone, className, tip}: {children: ReactNode; tone?: 'warn' | 'negative'; className?: string; tip?: string}) {
  return (
    <TextTooltip className={cx('rp-badge', tone, className)} text={tip}>
      {children}
    </TextTooltip>
  );
}

// Toasts: react-aria's queue rendered like S2's ToastContainer; timers pause while hovered, focused or listed.
type ToastKind = 'positive' | 'negative' | 'neutral' | 'info' | 'warning';
// A button in the toast, as S2's actionLabel / onAction / shouldCloseOnAction. A toast with one, or with an error to copy,
// stays until closed: the person needs time to reach the button (WCAG 2.2.1).
type ToastAction = {label: string; onAction: () => void; closeOnAction?: boolean};
// The detail is a second, smaller line under the message: what went wrong, in the backend's words.
// A toast about an error object, of any kind, records it and offers to copy it as an action; one that is not
// about an error has nothing to copy.
// `id` names what the toast is about: a toast replaces the earlier one with its id, which by default is its words.
type ToastOptions = {detail?: string; action?: ToastAction; requestId?: string; error?: unknown; id?: string};
type ToastMessage = {kind: ToastKind; text: string; detail?: string; action?: ToastAction; diagnostic?: Diagnostic};
const toasts = new ToastQueue<ToastMessage>({maxVisibleToasts: 5});
// A repeated message replaces its earlier copy at the front instead of stacking behind it.
const queued = new Map<string, string>();
// A toast leaves the request id out of its words and logs the failure with it instead, where a bug report can find it.
// Returns the toast's key, which closes it.
export const toast = (kind: ToastKind, text: string, {detail, action, requestId, error, id: about}: ToastOptions = {}) => {
  const diagnostic = error === undefined ? undefined : recordDiagnostic(error);
  if (requestId) console.warn(`${text}${detail ? `\n${detail}` : ''} (request_id: ${requestId})`);
  const id = about ?? [kind, text, detail ?? ''].join('\n');
  const earlier = queued.get(id);
  if (earlier) toasts.close(earlier);
  const key = toasts.add(
    {kind, text, detail, action, diagnostic},
    {
      timeout: action || diagnostic ? undefined : 5000,
      onClose: () => {
        if (queued.get(id) === key) queued.delete(id);
      }
    }
  );
  queued.set(id, key);
  return key;
};
export const closeToast = (key: string) => toasts.close(key);
// A failed action's toast: its summary, with the error as the detail. An unknown operation outcome is shown on its own,
// neutrally.
export const toastFailure = (error: unknown, t: Translator, summary: string, action?: ToastAction) => {
  const notice = failureNotice(error, t, summary);
  toast(notice.kind, notice.text, {detail: notice.detail, requestId: notice.requestId, action, error});
};
// An error as a toast's detail, with its request id passed on for the log and the error itself for the toast to record.
export const toastErrorDetail = (error: unknown, t: Translator) => ({
  detail: errorText(error, t, false),
  requestId: requestIdOf(error),
  error
});
const TOAST_ICON = {positive: CheckmarkCircle, negative: AlertTriangle, warning: AlertTriangle, info: InfoCircle, neutral: null};
// S2's ToastContainer placements: the edge the toasts stack from, then an optional end alignment.
export type ToastPlacement = 'top' | 'top end' | 'bottom' | 'bottom end';
// `page` names the current page: the expanded list and its underlay belong to the page they were opened on, so moving
// to another page collapses them.
export function Toasts({
  placement = 'bottom',
  page = '',
  onCopyError
}: {
  placement?: ToastPlacement;
  page?: string;
  onCopyError: (diagnostic: Diagnostic) => void;
}) {
  const [edge, align = 'center'] = placement.split(' ') as ['top' | 'bottom', 'end' | undefined];
  const t = useT();
  const [expandedOn, setExpandedOn] = useState<string | null>(null);
  // Leaving the page drops the expansion, so coming back to it opens with the stack collapsed.
  if (expandedOn !== null && expandedOn !== page) setExpandedOn(null);
  const expanded = expandedOn === page;
  const setExpanded = useCallback((open: boolean) => setExpandedOn(open ? page : null), [page]);
  useEffect(() => {
    if (expanded) toasts.pauseAll();
    else toasts.resumeAll();
  }, [expanded]);
  // The list closes with its last toast; the region itself unmounts then.
  useEffect(
    () =>
      toasts.subscribe(() => {
        if (toasts.visibleToasts.length === 0) setExpandedOn(null);
      }),
    []
  );
  useEffect(() => {
    if (!expanded) return;
    // One Escape closes one layer: an open dialog takes it unless focus is in the toasts themselves.
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const inToasts = (e.target as Element | null)?.closest?.('.rp-toasts');
      if (inToasts || !document.querySelector(escapeLayers)) setExpandedOn(null);
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
      <ToastStack expanded={expanded} edge={edge} onExpand={() => setExpanded(true)} onCopyError={onCopyError} />
    </ToastRegion>
  );
}
function ToastStack({
  expanded,
  edge,
  onExpand,
  onCopyError
}: {
  expanded: boolean;
  edge: 'top' | 'bottom';
  onExpand: () => void;
  onCopyError: (diagnostic: Diagnostic) => void;
}) {
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
            onCopyError={onCopyError}
          />
        );
      }}
    </ToastList>
  );
}
// One toast, after S2's with the message in two levels: the icon, the summary with its detail below, and close on the
// first line; under them, only when there is one, a row with "show all" at the start and the actions at the end (its
// own, then "copy error"), which ends where close ends. The same on a phone.
function ToastItem({
  item,
  state,
  depth,
  count,
  background,
  more,
  onCopyError
}: {
  item: QueuedToast<ToastMessage>;
  state: ToastState<ToastMessage>;
  depth: number;
  count: number;
  background: boolean;
  more: {edge: 'top' | 'bottom'; onExpand: () => void} | null;
  onCopyError: (diagnostic: Diagnostic) => void;
}) {
  const t = useT();
  const Icon = TOAST_ICON[item.content.kind];
  const {text, detail, action, diagnostic} = item.content;
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
      <RButton slot="close" className="rp-btn quiet icon close" aria-label={t('ui.close')}>
        <Close />
      </RButton>
      {(more || action || diagnostic) && (
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
          {diagnostic && (
            <RButton className="rp-btn action" onPress={() => onCopyError(diagnostic)}>
              {t('toast.copyError')}
            </RButton>
          )}
        </div>
      )}
    </RToast>
  );
}
