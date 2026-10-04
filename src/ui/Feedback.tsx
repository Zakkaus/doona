import {useCallback, useContext, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode} from 'react';
import {VisuallyHidden} from 'react-aria';
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
import {columns as listColumns, cx} from './cx';
import {Button} from './Button';
import {ProgressCircle} from './ProgressCircle';

export {ProgressCircle};
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
export function ChartWait({holds, children}: {holds?: 'tall' | 'bars' | 'form'; children: ReactNode}) {
  return <div className={cx('rp-chart-wait', holds)}>{children}</div>;
}

// A loading state holds its box at once and shows after 150ms, so a fast load does not flash it.
export function useWaitAttr() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(timer);
  }, []);
  return visible ? undefined : '';
}

export function Loading({children}: {children?: ReactNode}) {
  const t = useT();
  const wait = useWaitAttr();
  const id = useId();
  return (
    <div className="rp-empty" role="status" data-wait={wait}>
      <ProgressCircle size="S" aria-labelledby={id} />
      <span id={id}>{children ?? t('ui.loading')}</span>
    </div>
  );
}

// The loading rule (CONTRIBUTING, Loading states): a first load whose content shape is known draws S2's Skeleton in
// that shape and box, so nothing moves when the content replaces it; ProgressCircle (Loading) is for waits whose shape
// is unknown or tiny. Every skeleton holds its box at once, shows after 150ms like Loading, reads one visually hidden
// loading status, and keeps its drawing inert and hidden from assistive technology.
// Bar widths that vary from row to row, so rows do not read as a grid of equal bars.
const longBars = [72, 88, 64, 80, 58, 84];
const shortBars = [56, 44, 64, 50, 60, 40];
export function SkeletonStatus({label}: {label?: string}) {
  const t = useT();
  return <VisuallyHidden role="status">{label ?? t('ui.loading')}</VisuallyHidden>;
}

// S2's Skeleton for a card body of facts while its data arrives: the facts' grid with each label and value drawn as a
// shimmering block in its place, then what the body holds below them (a caption line, a body line, or a height in
// pixels such as a table's), so the card keeps its height when the values replace it. `helped` lists the facts whose
// label carries a help button, whose line takes the button's height.
export function Skeleton({facts, helped, below}: {facts: number; helped?: number[]; below?: 'caption' | 'body' | number}) {
  const wait = useWaitAttr();
  return (
    <div className="rp-skeleton" data-wait={wait}>
      <SkeletonStatus />
      <div className="rp-kv" inert aria-hidden="true">
        {Array.from({length: facts}, (_, i) => (
          <div key={i}>
            <span className={cx('k', helped?.includes(i) && 'helped')}>
              <span className="rp-skeleton-text" />
            </span>
            <span className="v">
              <span className="rp-skeleton-text" />
            </span>
          </div>
        ))}
      </div>
      {below !== undefined && (
        <div
          className={cx('rp-skeleton-below', typeof below === 'number' && 'block')}
          style={{height: typeof below === 'number' ? below : `var(--rp-line-${below})`}}
          inert
          aria-hidden="true"
        >
          <span className="rp-skeleton-text" />
        </div>
      )}
    </div>
  );
}

// The Skeleton for a body of a known kind, drawn in the loaded body's own parts so it takes the same box: `block`, one
// block filling its box (a chart, an editor), as inside a ChartWait, or `height` pixels tall; `rows`, list rows at the
// control height; `bars`, ranking bars in the Bar's own label line and track, laid out as a wide card's list with
// `columns`; `fields`, labelled fields in the field grid; `cards`, card surfaces `height` pixels tall, in a column or,
// with `grid`, in a CardView's grid. `label` replaces the status text.
export type SkeletonShape = 'block' | 'rows' | 'bars' | 'fields' | 'cards';
export function SkeletonBody({
  shape,
  count = 3,
  height,
  grid,
  columns,
  label
}: {
  shape: SkeletonShape;
  count?: number;
  height?: number;
  grid?: boolean;
  columns?: boolean;
  label?: string;
}) {
  const wait = useWaitAttr();
  const n = shape === 'block' ? 1 : count;
  if (shape === 'cards')
    return (
      <div className={cx('rp-skeleton-cards', grid && 'grid')} data-wait={wait}>
        <SkeletonStatus label={label} />
        {Array.from({length: n}, (_, i) => (
          <div key={i} className="rp-card" style={{height}} inert aria-hidden="true" />
        ))}
      </div>
    );
  const line = (i: number, bars = longBars) => <span className="rp-skeleton-text" style={{width: `${bars[i % 6]}%`}} />;
  return (
    <div
      className={cx('rp-skeleton-body', shape, shape === 'bars' && 'rp-list', columns && 'rp-columns')}
      style={columns ? listColumns(n) : height ? {height} : undefined}
      data-wait={wait}
    >
      <SkeletonStatus label={label} />
      {Array.from({length: n}, (_, i) =>
        shape === 'block' ? (
          <span key={i} className="rp-skeleton-text" inert aria-hidden="true" />
        ) : shape === 'bars' ? (
          <div key={i} className="rp-bar" inert aria-hidden="true">
            <div className="top">
              <span className="l">{line(i)}</span>
              <span className="v">{line(i, shortBars)}</span>
            </div>
            <div className="track" />
          </div>
        ) : shape === 'fields' ? (
          <div key={i} className="rp-skeleton-field" inert aria-hidden="true">
            {line(i, shortBars)}
            <span className="rp-skeleton-text" />
          </div>
        ) : (
          <div key={i} className="rp-skeleton-row" inert aria-hidden="true">
            {line(i)}
          </div>
        )
      )}
    </div>
  );
}
// One Skeleton bar for a part a feature lays out beside its real labels: a control at the control height, a line of
// body or caption text, or a block `height` pixels tall such as a small chart. Inert and hidden from assistive technology; a SkeletonGroup round it reads the status.
export function SkeletonBar({line, width, height}: {line?: 'body' | 'caption'; width?: number | string; height?: number}) {
  return <span className={cx('rp-skeleton-text', 'rp-skeleton-bar', line ?? 'control')} style={{width, height}} inert aria-hidden="true" />;
}
// A Skeleton block over its positioned parent's whole box, for a hold that lays out the loaded view hidden underneath
// so the block takes its exact size.
export function SkeletonCover() {
  return <span className="rp-skeleton-text rp-skeleton-cover" inert aria-hidden="true" />;
}
// One card's surface `height` pixels tall with its Skeleton block, for a grid that places cards itself, such as the
// dashboard's; inside a SkeletonGroup, which reads the status.
export function SkeletonCard({height}: {height: number}) {
  return (
    <div className="rp-skeleton-cards" inert aria-hidden="true">
      <div className="rp-card" style={{height}} />
    </div>
  );
}
// Labelled parts drawn with SkeletonBars, in place in their container's own layout: one loading status for them all,
// shown after the same 150ms.
export function SkeletonGroup({label, children}: {label?: string; children: ReactNode}) {
  return (
    <div className="rp-skeleton-group" data-wait={useWaitAttr()}>
      <SkeletonStatus label={label} />
      {children}
    </div>
  );
}

// The Skeleton for a table's first load: placeholder rows at the real row height under the real header, one bar per
// cell in the columns' own proportions. The columns carry no kind, so their shape stands in for it: a row header, a
// wrapping column or a wide one holds text and takes a long bar, a narrow one (a time, a number, a state) a short bar,
// and an actions column none.
type SkeletonColumn = {minWidth: number; grow?: number; isRowHeader?: boolean; actions?: boolean; text?: 'wrap'};
// `quiet`: inside a page's Skeleton, which holds the status and the delay.
export function TableSkeleton({cols, rows, quiet}: {cols: SkeletonColumn[]; rows: number; quiet?: boolean}) {
  const wait = useWaitAttr();
  const template = cols.map(c => `minmax(${c.minWidth}px, ${c.minWidth * (c.grow ?? (c.isRowHeader ? 2 : 1))}fr)`).join(' ');
  return (
    <div className="rp-table-skeleton" data-wait={quiet ? undefined : wait}>
      {!quiet && <SkeletonStatus />}
      <div style={{gridTemplateColumns: template}} inert aria-hidden="true">
        {Array.from({length: rows}, (_, row) =>
          cols.map((c, col) => {
            const bars = c.isRowHeader || c.text === 'wrap' || c.minWidth >= 200 ? longBars : shortBars;
            return (
              <span key={`${row}-${col}`}>{!c.actions && <span className="rp-skeleton-text" style={{width: `${bars[(row * 5 + col * 3) % 6]}%`}} />}</span>
            );
          })
        )}
      </div>
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
