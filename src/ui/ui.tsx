// Small control kit on react-aria-components, styled by theme.css with the Rosé Pine variables.
import {useId, useLayoutEffect, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode, type RefObject} from 'react';
import {flushSync} from 'react-dom';
import {
  Button as RButton,
  ToggleButton,
  ToggleButtonGroup,
  Menu,
  MenuItem,
  MenuTrigger,
  MenuSection,
  Header,
  Popover,
  Select,
  SelectValue,
  ListBox,
  ListBoxItem,
  Tooltip,
  TooltipTrigger,
  OverlayArrow,
  type Key
} from 'react-aria-components';
import ChevronDown from './icons/ChevronDown';
import Close from './icons/Close';
import Checkmark from './icons/Checkmark';
import CheckmarkCircle from './icons/CheckmarkCircle';
import AlertTriangle from './icons/AlertTriangle';
import InfoCircle from './icons/InfoCircle';
import Search from './icons/Search';
import {useT} from '../i18n';

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ');

// Wrap a state change in a view transition (a page-wide crossfade) where the browser supports it.
export function withCrossfade(fn: () => void) {
  const d = document as Document & {startViewTransition?: (cb: () => void) => void};
  if (!d.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return fn();
  d.startViewTransition(() => flushSync(fn));
}

// Press feedback is pure CSS (a small scale on [data-pressed], see theme.css): a JS-computed perspective transform
// on every press promoted the button to its own layer mid-gesture and felt abrupt. The hook stays for the ref.
export function usePress(): [RefObject<HTMLButtonElement | null>, (rp: {isPressed: boolean}) => CSSProperties] {
  const ref = useRef<HTMLButtonElement>(null);
  return [ref, () => ({})];
}
function PressButton(props: Parameters<typeof RButton>[0]) {
  const [ref, style] = usePress();
  return <RButton {...props} ref={ref} style={style} />;
}
function PressToggle(props: Parameters<typeof ToggleButton>[0]) {
  const [ref, style] = usePress();
  return <ToggleButton {...props} ref={ref} style={style} />;
}

// A selection indicator that slides between items, as in S2's SegmentedControl and Tabs.
export function useSlider(value: string, selector = '[data-selected]') {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{x: number; y: number; w: number; h: number} | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const sel = el.querySelector<HTMLElement>(selector);
      if (!sel) return setPos(null);
      setPos({x: sel.offsetLeft, y: sel.offsetTop, w: sel.offsetWidth, h: sel.offsetHeight});
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, selector]);
  return [ref, pos] as const;
}

// accent / primary / secondary / negative are S2 Button variants (pills); the rest is an ActionButton (radius 8).
export function Button({
  children,
  onPress,
  quiet,
  small,
  icon,
  accent,
  primary,
  secondary,
  negative,
  label,
  isDisabled,
  tip,
  type,
  appearance,
  className
}: {
  children?: ReactNode;
  onPress?: () => void;
  quiet?: boolean;
  small?: boolean;
  icon?: boolean;
  accent?: boolean;
  primary?: boolean;
  secondary?: boolean;
  negative?: boolean;
  label?: string;
  isDisabled?: boolean;
  tip?: string;
  type?: 'button' | 'submit' | 'reset';
  appearance?: 'search' | 'version' | 'select';
  className?: string;
}) {
  const btn = (
    <PressButton
      className={cx(
        appearance ? `rp-${appearance}` : 'rp-btn',
        quiet && 'quiet',
        small && 'sm',
        icon && 'icon',
        accent && 'accent',
        primary && 'primary',
        secondary && 'secondary',
        negative && 'negative',
        className
      )}
      onPress={onPress}
      aria-label={label}
      isDisabled={isDisabled}
      type={type}
    >
      {children}
    </PressButton>
  );
  const text = label ?? tip;
  return text ? (
    <TooltipTrigger delay={400}>
      <Tip>{text}</Tip>
      {btn}
    </TooltipTrigger>
  ) : (
    btn
  );
}
function Tip({children}: {children: ReactNode}) {
  return (
    <Tooltip className="rp-tip" offset={6}>
      <OverlayArrow /> {children}
    </Tooltip>
  );
}
export function Segmented({items, value, onChange, label}: {items: Array<[string, string]>; value: string; onChange: (k: string) => void; label: string}) {
  const [ref, pos] = useSlider(value);
  return (
    <ToggleButtonGroup
      ref={ref}
      className="rp-seg"
      aria-label={label}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={k => {
        const v = [...k][0];
        if (v != null) onChange(String(v));
      }}
    >
      {pos && <span className="rp-slider" style={{translate: `${pos.x}px 0`, width: pos.w}} />}
      {items.map(([k, l]) => (
        <PressToggle key={k} id={k} className="rp-btn">
          {l}
        </PressToggle>
      ))}
    </ToggleButtonGroup>
  );
}
type Item = {id: string; label: string; desc?: string; icon?: ReactNode; tone?: 'ok' | 'warn' | 'err'};
// Label with an optional leading icon (a flag, a swatch); shared by menu items and the rendered value of a select.
const ItemLabel = ({i}: {i: Item}) => (
  <span className="rp-il">
    {i.icon && <span className="ic">{i.icon}</span>}
    <span>{i.label}</span>
  </span>
);
// S2 marks the selected item with a checkmark in a leading column, not with a background.
export const Check = () => <Checkmark className="rp-check-mark" />;
const item = (i: Item) => (
  <MenuItem key={i.id} id={i.id} className="rp-item" textValue={i.label}>
    <Check />
    <ItemLabel i={i} />
    {i.desc && <span className={cx('desc', i.tone)}>{i.desc}</span>}
  </MenuItem>
);
type Picked = {value: string; onChange: (k: string) => void};
const pick = (on: (k: string) => void) => (k: 'all' | Set<Key>) => {
  if (k === 'all') return;
  const v = [...k][0];
  if (v != null) on(String(v));
};
// `extra` is a second section with its own selection (a setting beside the main choice).
export function MenuButton({
  children,
  items,
  sections,
  value,
  onChange,
  label,
  quiet,
  chevron = true,
  extra
}: {
  children: ReactNode;
  items?: Item[];
  sections?: Array<{title: string; items: Item[]}>;
  value: string;
  onChange: (k: string) => void;
  label: string;
  quiet?: boolean;
  chevron?: boolean;
  extra?: {title: string; items: Item[]} & Picked;
}) {
  return (
    <MenuTrigger>
      <PressButton className={cx('rp-btn', quiet && 'quiet', !chevron && 'icon')} aria-label={label}>
        {children}
        {chevron && <ChevronDown />}
      </PressButton>
      <Popover className="rp-popover" placement="bottom end">
        {sections ? (
          <Menu aria-label={label}>
            {sections.map(sec => (
              <MenuSection key={sec.title} id={sec.title} selectionMode="single" selectedKeys={[value]} onSelectionChange={pick(onChange)}>
                <Header className="rp-sec-h">{sec.title}</Header>
                {sec.items.map(item)}
              </MenuSection>
            ))}
            {[extra].map(
              x =>
                x && (
                  <MenuSection key={x.title} id={x.title} selectionMode="single" selectedKeys={[x.value]} onSelectionChange={pick(x.onChange)}>
                    <Header className="rp-sec-h">{x.title}</Header>
                    {x.items.map(item)}
                  </MenuSection>
                )
            )}
          </Menu>
        ) : (
          <Menu selectionMode="single" selectedKeys={[value]} onSelectionChange={pick(onChange)} aria-label={label}>
            {(items ?? []).map(item)}
          </Menu>
        )}
      </Popover>
    </MenuTrigger>
  );
}
export function InlineSelect({items, value, onChange, label}: {items: Item[]; value: string; onChange: (k: string) => void; label: string}) {
  return (
    <Select
      aria-label={label}
      selectedKey={value}
      onSelectionChange={(k: Key | null) => {
        if (k != null) onChange(String(k));
      }}
    >
      <PressButton className="rp-select">
        <SelectValue>{({selectedItem}) => (selectedItem ? <ItemLabel i={selectedItem as Item} /> : value)}</SelectValue>
        <ChevronDown />
      </PressButton>
      <Popover className="rp-popover" placement="bottom start">
        <ListBox items={items}>
          {i => (
            <ListBoxItem id={i.id} className="rp-item" textValue={i.label}>
              <Check />
              <ItemLabel i={i} />
              {i.desc && <span className={cx('desc', i.tone)}>{i.desc}</span>}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  );
}
export function Light({tone, children, small}: {tone: 'ok' | 'warn' | 'err' | 'info' | 'neutral' | 'muted'; children: ReactNode; small?: boolean}) {
  return <span className={cx('rp-light', tone, small && 'sm')}>{children}</span>;
}
export function Bar({label, value, pct, color, icon}: {label: ReactNode; value: string; pct: number; color: string; icon?: ReactNode}) {
  return (
    <div className="rp-bar">
      <div className="top">
        <span className="l">
          {icon && <span className="ic">{icon}</span>}
          {label}
        </span>
        <span className="v">{value}</span>
      </div>
      <div className="track" aria-hidden="true">
        <div className="fill" style={{width: `${Math.max(0, Math.min(100, pct))}%`, background: color}} />
      </div>
    </div>
  );
}

// ---- Additions for the remaining pages ----
import {useEffect, type ReactElement} from 'react';
import {
  Switch as RSwitch,
  TextField as RTextField,
  SearchField as RSearchField,
  Text,
  Label,
  Input as RInput,
  Table,
  TableHeader,
  Column,
  TableBody,
  Row,
  Cell,
  DialogTrigger,
  Modal,
  ModalOverlay,
  Dialog,
  Heading,
  type Selection,
  type SortDescriptor
} from 'react-aria-components';

export function Switch({
  children,
  isSelected,
  onChange,
  isDisabled
}: {
  children: ReactNode;
  isSelected: boolean;
  onChange: (v: boolean) => void;
  isDisabled?: boolean;
}) {
  return (
    <RSwitch className="rp-switch" isSelected={isSelected} onChange={onChange} isDisabled={isDisabled}>
      <span className="track" />
      {children}
    </RSwitch>
  );
}
export function TextField({
  label,
  width,
  search,
  large,
  side,
  className,
  placeholder,
  description,
  error,
  action,
  autoComplete,
  spellCheck,
  ...props
}: Pick<ComponentProps<typeof RTextField>, 'value' | 'onChange' | 'defaultValue' | 'name' | 'type' | 'isInvalid' | 'validationBehavior' | 'autoFocus'> &
  Pick<ComponentProps<typeof RInput>, 'autoComplete' | 'spellCheck'> & {
    label: string;
    width?: number;
    search?: boolean;
    large?: boolean;
    side?: boolean;
    className?: string;
    placeholder?: string;
    description?: string;
    error?: string;
    action?: ReactNode;
  }) {
  const t = useT();
  const errorId = useId();
  if (search) {
    return (
      <RSearchField {...props} aria-label={label} className={cx('rp-input', large && 'lg', className)} style={width ? {width} : undefined}>
        <Search />
        <RInput placeholder={placeholder ?? label} autoComplete={autoComplete} spellCheck={spellCheck} />
        <RButton className="clear" aria-label={t('clear')}>
          <Close />
        </RButton>
      </RSearchField>
    );
  }
  const input = (
    <span className={cx('rp-input', (side || !!action) && 'rp-grow')}>
      <RInput placeholder={placeholder} autoComplete={autoComplete} spellCheck={spellCheck} aria-describedby={error ? errorId : undefined} />
    </span>
  );
  return (
    <RTextField {...props} className={cx(side ? 'rp-cluster' : 'rp-field', className)} style={width ? {width} : undefined}>
      <Label className="rp-label">{label}</Label>
      {action ? (
        <div className="rp-toolbar">
          {input}
          {action}
        </div>
      ) : (
        input
      )}
      {description && (
        <Text slot="description" className="rp-label">
          {description}
        </Text>
      )}
      {error && (
        <span id={errorId} role="alert">
          {error}
        </span>
      )}
    </RTextField>
  );
}
export function LabeledSelect({
  label,
  items,
  value,
  onChange,
  isDisabled,
  side,
  bare
}: {
  label: string;
  items: Item[];
  value: string;
  onChange: (k: string) => void;
  isDisabled?: boolean;
  side?: boolean;
  bare?: boolean;
}) {
  const sel = (
    <Select
      aria-label={label}
      selectedKey={value}
      onSelectionChange={(k: Key | null) => {
        if (k != null) onChange(String(k));
      }}
      isDisabled={isDisabled}
    >
      <PressButton className="rp-selectbtn">
        <SelectValue>{({selectedItem}) => (selectedItem ? <ItemLabel i={selectedItem as Item} /> : value)}</SelectValue>
        <ChevronDown />
      </PressButton>
      <Popover className="rp-popover" placement="bottom start">
        <ListBox items={items}>
          {i => (
            <ListBoxItem id={i.id} className="rp-item" textValue={i.label}>
              <Check />
              <ItemLabel i={i} />
              {i.desc && <span className={cx('desc', i.tone)}>{i.desc}</span>}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  );
  if (bare) return sel;
  if (side)
    return (
      <span className="rp-cluster">
        <span className="rp-label">{label}</span>
        {sel}
      </span>
    );
  return (
    <div className="rp-field">
      <span className="lbl">{label}</span>
      {sel}
    </div>
  );
}
export function Badge({children, tone, className}: {children: ReactNode; tone?: 'warn'; className?: string}) {
  return <span className={cx('rp-badge', tone, className)}>{children}</span>;
}
export function Kv({items, inline}: {items: Array<[string, string]>; inline?: boolean}) {
  return (
    <div className={cx('rp-kv', inline && 'inline')}>
      {items.map(([k, v]) => (
        <div key={k}>
          <span className="k">{k}</span>
          <span className="v">{v}</span>
        </div>
      ))}
    </div>
  );
}
// Virtual collections render the same tile body inside their own selectable item.
export type NodeTileProps = {
  name: string;
  icon?: ReactNode;
  tcp?: number;
  udp?: number;
  v6?: boolean;
  alive?: boolean;
  unavailable?: boolean;
  description?: string;
  nested?: boolean;
  selected?: boolean;
  cur?: boolean;
  onPress?: () => void;
  isDisabled?: boolean;
  bodyOnly?: boolean;
  labels: {timeout: string; nested: string; cur: string};
};
export const latencyTone = (ms: number) => (ms < 100 ? 'ok' : ms < 180 ? 'warn' : 'err');
export function NodeTile({
  name,
  icon,
  tcp,
  udp,
  v6,
  alive = true,
  unavailable = !alive || tcp == null,
  description,
  nested,
  selected,
  cur,
  onPress,
  isDisabled,
  bodyOnly,
  labels
}: NodeTileProps) {
  const t = useT();
  const body = (
    <>
      <span className="top">
        <span className="n">
          {icon && <span className="ic">{icon}</span>}
          {name}
        </span>
        {nested ? (
          <Badge>{labels.nested}</Badge>
        ) : alive && tcp != null ? (
          <span className={'ms ' + latencyTone(tcp)}>{t('ui.latency', {n: tcp})}</span>
        ) : (
          <span className={cx('ms', unavailable && 'err')}>{unavailable ? labels.timeout : '—'}</span>
        )}
      </span>
      <span className="s">
        {description ?? (nested || !alive ? ' ' : [t('ui.udpLatency', {n: String(udp)}), v6 && t('ui.ipv6')].filter(Boolean).join(' · '))}
        {cur && !onPress && <span className="cur">{labels.cur}</span>}
      </span>
    </>
  );
  if (bodyOnly) return body;
  if (onPress) {
    return (
      <ToggleButton className="rp-node" isSelected={selected} isDisabled={isDisabled} onChange={onPress}>
        {body}
      </ToggleButton>
    );
  }
  return <div className={cx('rp-node', cur && 'cur')}>{body}</div>;
}

// Table: fixed height, scrolls, optional single selection.
export type Col = {id: string; label: string; width?: number; isRowHeader?: boolean; align?: 'end'};
export function DataTable<T extends {id: string}>({
  label,
  cols,
  rows,
  render,
  height = 442,
  selected,
  onSelect,
  empty
}: {
  label: string;
  cols: Col[];
  rows: T[];
  render: (r: T) => ReactNode[];
  height?: number;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  empty?: string;
}) {
  const keys: Selection = selected ? new Set([selected]) : new Set();
  return (
    <div className="rp-table" style={{height}}>
      <Table
        aria-label={label}
        selectionMode={onSelect ? 'single' : 'none'}
        selectedKeys={keys}
        onSelectionChange={k => onSelect && onSelect(k === 'all' ? null : k.size ? String([...k][0]) : null)}
        disallowEmptySelection={!!onSelect}
      >
        <TableHeader>
          {cols.map(c => (
            <Column
              key={c.id}
              id={c.id}
              isRowHeader={c.isRowHeader}
              className={c.align === 'end' ? 'end' : undefined}
              style={c.width ? {width: c.width} : undefined}
            >
              {c.label}
            </Column>
          ))}
        </TableHeader>
        <TableBody items={rows} renderEmptyState={() => <div className="empty">{empty ?? ''}</div>}>
          {r => (
            <Row id={r.id}>
              {render(r).map((cell, i) => (
                <Cell key={cols[i].id} className={cols[i].align === 'end' ? 'end' : undefined}>
                  {cell}
                </Cell>
              ))}
            </Row>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// Dialogs
export function ModalDialog({
  trigger,
  title,
  children,
  footer,
  narrow,
  alert,
  isOpen,
  onOpenChange,
  hideTitle
}: {
  trigger?: ReactElement;
  title: string;
  children: ReactNode | ((close: () => void) => ReactNode);
  footer?: (close: () => void) => ReactNode;
  narrow?: boolean;
  alert?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTitle?: boolean;
}) {
  const modal = (
    <ModalOverlay className="rp-underlay" isDismissable={!alert} isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal>
        <Dialog className={cx('rp-dialog', narrow && 'narrow')} role={alert ? 'alertdialog' : 'dialog'} aria-label={hideTitle ? title : undefined}>
          {({close}) => (
            <>
              {!hideTitle && <Heading slot="title">{title}</Heading>}
              {typeof children === 'function' ? children(close) : children}
              {footer && <div className="foot">{footer(close)}</div>}
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
  return trigger ? (
    <DialogTrigger>
      {trigger}
      {modal}
    </DialogTrigger>
  ) : (
    modal
  );
}

// Toasts: a queue rendered once by the shell, stacked like S2's ToastContainer.
// The newest toast sits on top; older ones peek out behind it. Clicking the stack or "show all" expands the list over an underlay.
type ToastKind = 'positive' | 'negative' | 'neutral' | 'info';
type ToastItem = {id: number; kind: ToastKind; msg: string; exiting?: boolean; timer?: ReturnType<typeof setTimeout>; left: number; since: number};
let listeners: Array<(t: ToastItem[]) => void> = [];
let queue: ToastItem[] = [];
let seq = 0;
let paused = false;
const publish = () => listeners.forEach(l => l(queue));
const EXIT_MS = 400;
const TIMEOUT_MS = 5000;
const arm = (t: ToastItem) => {
  t.since = Date.now();
  t.timer = setTimeout(() => dismiss(t.id), t.left);
};
const disarm = (t: ToastItem) => {
  if (t.timer) {
    clearTimeout(t.timer);
    t.timer = undefined;
    t.left = Math.max(1000, t.left - (Date.now() - t.since));
  }
};
const setPaused = (p: boolean) => {
  if (p === paused) return;
  paused = p;
  queue.forEach(t => {
    if (t.exiting) return;
    if (p) disarm(t);
    else if (!t.timer) arm(t);
  });
};
const dismiss = (id: number) => {
  const t = queue.find(t => t.id === id);
  if (!t || t.exiting) return;
  disarm(t);
  queue = queue.map(x => (x.id === id ? {...x, exiting: true} : x));
  publish();
  setTimeout(() => {
    queue = queue.filter(x => x.id !== id);
    publish();
  }, EXIT_MS);
};
const clearAll = () => queue.forEach(t => dismiss(t.id));
export const toast = (kind: ToastKind, msg: string) => {
  const t: ToastItem = {id: ++seq, kind, msg, left: TIMEOUT_MS, since: Date.now()};
  if (!paused) arm(t);
  queue = [...queue, t];
  publish();
};
const TOAST_ICON = {positive: CheckmarkCircle, negative: AlertTriangle, info: InfoCircle, neutral: null};
export function Toasts({labels}: {labels: {close: string; showAll: (n: number) => string; collapse: string; clearAll: string}}) {
  const [items, setItems] = useState(queue);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const listener = (items: ToastItem[]) => {
      setItems(items);
      if (!items.some(t => !t.exiting)) setExpanded(false);
    };
    listeners.push(listener);
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  }, []);
  const live = items.filter(t => !t.exiting);
  useEffect(() => {
    setPaused(expanded);
  }, [expanded]);
  useEffect(() => {
    if (!expanded) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [expanded]);
  if (items.length === 0) return null;
  // Newest first: index 0 is the main toast, the rest stack behind it when collapsed.
  const ordered = [...items].reverse();
  return (
    <>
      {expanded && <button type="button" className="rp-toast-underlay" aria-label={labels.collapse} onClick={() => setExpanded(false)} />}
      <div
        className={cx('rp-toasts', expanded && 'expanded')}
        role="region"
        aria-live="polite"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => {
          if (!expanded) setPaused(false);
        }}
      >
        {expanded && (
          <div className="rp-toast-controls">
            <RButton className="rp-btn sm" onPress={clearAll}>
              {labels.clearAll}
            </RButton>
            <RButton className="rp-btn sm" onPress={() => setExpanded(false)}>
              {labels.collapse}
            </RButton>
          </div>
        )}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- mouse-only convenience; the keyboard path is the "show all" button */}
        <div
          className="rp-toast-list"
          onClick={e => {
            if (!expanded && live.length > 1 && !(e.target as Element).closest('button')) setExpanded(true);
          }}
        >
          {ordered.map((t, i) => {
            const idx = t.exiting ? 0 : live.length - 1 - live.indexOf(t);
            const Icon = TOAST_ICON[t.kind];
            const background = !expanded && idx > 0;
            return (
              <div
                key={t.id}
                className={cx('rp-toast', t.kind, t.exiting && 'exiting', background && 'background')}
                style={{zIndex: ordered.length - i, '--i': Math.min(idx, 3)} as CSSProperties}
                aria-hidden={background || undefined}
              >
                <div className="main">
                  <span className="body">
                    {Icon && <Icon />}
                    <span className="grow">{t.msg}</span>
                  </span>
                  {!expanded && idx === 0 && live.length > 1 && (
                    <RButton className="rp-btn sm quiet more" onPress={() => setExpanded(true)}>
                      {labels.showAll(live.length)}
                    </RButton>
                  )}
                </div>
                <RButton className="rp-btn quiet icon close" aria-label={labels.close} onPress={() => dismiss(t.id)}>
                  <Close />
                </RButton>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
export type {SortDescriptor};
