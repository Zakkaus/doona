// Small control kit on react-aria-components, styled by theme.css with the Rosé Pine variables.
import {useId, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode} from 'react';
import {flushSync} from 'react-dom';
import {
  Button as RButton,
  Link as RLink,
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
  Disclosure as RDisclosure,
  DisclosureGroup as RDisclosureGroup,
  DisclosurePanel,
  Focusable,
  Tabs as RTabs,
  TabList,
  Tab,
  TabPanel,
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
import {ApiError} from '../api/error';

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ');

// Wrap a state change in a view transition (a page-wide crossfade) where the browser supports it.
export function withCrossfade(fn: () => void) {
  const d = document as Document & {startViewTransition?: (cb: () => void) => void};
  if (!d.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return fn();
  d.startViewTransition(() => flushSync(fn));
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
      const next = {x: sel.offsetLeft, y: sel.offsetTop, w: sel.offsetWidth, h: sel.offsetHeight};
      setPos(prev => (prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h ? prev : next));
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
  isPending,
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
  isPending?: boolean;
  tip?: string;
  type?: 'button' | 'submit' | 'reset';
  appearance?: 'search' | 'version' | 'select';
  className?: string;
}) {
  const btn = (
    <RButton
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
      isPending={isPending}
      type={type}
    >
      {isPending ? <span className="rp-spinner" aria-hidden="true" /> : null}
      {children}
    </RButton>
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
export function Tip({children}: {children: ReactNode}) {
  return (
    <Tooltip className="rp-tip" offset={6}>
      <OverlayArrow /> {children}
    </Tooltip>
  );
}

export function Disclosure({title, children, ...props}: Omit<ComponentProps<typeof RDisclosure>, 'children'> & {title: string; children: ReactNode}) {
  return (
    <RDisclosure {...props} className="rp-disclosure">
      <Heading level={3}>
        <RButton slot="trigger" className="rp-btn quiet rp-disclosure-trigger">
          <ChevronDown />
          {title}
        </RButton>
      </Heading>
      <DisclosurePanel className="rp-disclosure-panel">
        <div className="rp-disclosure-content">{children}</div>
      </DisclosurePanel>
    </RDisclosure>
  );
}

export function DisclosureGroup({children}: {children: ReactNode}) {
  return (
    <RDisclosureGroup className="rp-col" allowsMultipleExpanded>
      {children}
    </RDisclosureGroup>
  );
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
  const message = error instanceof Error ? error.message : String(error);
  return error instanceof ApiError && error.requestId ? `${message} · request_id: ${error.requestId}` : message;
}

// Resource refetch promises settle on both success and failure; refresh feedback uses committed inline errors.
export const visibleErrors = new Map<string, Error>();
export function ErrorMessage({error}: {error: Error | null | undefined}) {
  const t = useT();
  const id = useId();
  useLayoutEffect(() => {
    if (error) visibleErrors.set(id, error);
    return () => {
      visibleErrors.delete(id);
    };
  }, [error, id]);
  return error ? (
    <p role="alert" className="rp-alert">
      {t('ui.loadFailed', {error: errorText(error)})}
    </p>
  ) : null;
}

export function TextTooltip({children, text, className}: {children: ReactNode; text?: string; className?: string}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [nested, setNested] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflow(el.scrollWidth > el.clientWidth);
    // Inside a pressable ancestor the span must not be its own tab stop: a focusable child would swallow the row's
    // press. Grid navigation still reaches it, because a cell hands keyboard focus to its focusable child.
    setNested(!!el.closest('button, a, [role="option"], [role="menuitem"], [role="radio"], [role="row"]'));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children]);
  return (
    <TooltipTrigger delay={400} isDisabled={!overflow && !text}>
      <Focusable>
        <span ref={ref} className={cx('rp-truncate', className)} tabIndex={(overflow || text) && !nested ? 0 : -1}>
          {children}
        </span>
      </Focusable>
      <Tip>{text ?? children}</Tip>
    </TooltipTrigger>
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
        <ToggleButton key={k} id={k} className="rp-btn">
          {l}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
type Item = {id: string; label: string; desc?: string; icon?: ReactNode; tone?: 'ok' | 'warn' | 'err'};
// Label with an optional leading icon (a flag, a swatch); shared by menu items and the rendered value of a select.
const ItemLabel = ({i}: {i: Item}) => (
  <span className="rp-il">
    {i.icon && <span className="ic">{i.icon}</span>}
    <TextTooltip>{i.label}</TextTooltip>
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
  multiple = false,
  label,
  quiet,
  chevron = true,
  extra
}: {
  children: ReactNode;
  items?: Item[];
  sections?: Array<{title: string; items: Item[]}>;
  value: string | string[];
  onChange: (k: string) => void;
  multiple?: boolean;
  label: string;
  quiet?: boolean;
  chevron?: boolean;
  extra?: {title: string; items: Item[]} & Picked;
}) {
  return (
    <MenuTrigger>
      <RButton className={cx('rp-btn', quiet && 'quiet', !chevron && 'icon')} aria-label={label}>
        {children}
        {chevron && <ChevronDown />}
      </RButton>
      <Popover className="rp-popover" placement="bottom end">
        {sections ? (
          <Menu aria-label={label}>
            {sections.map(sec => (
              <MenuSection
                key={sec.title}
                id={sec.title}
                selectionMode="single"
                selectedKeys={typeof value === 'string' ? [value] : value}
                onSelectionChange={pick(onChange)}
              >
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
          <Menu
            selectionMode={multiple ? 'multiple' : 'single'}
            selectedKeys={typeof value === 'string' ? [value] : value}
            onSelectionChange={multiple ? undefined : pick(onChange)}
            onAction={multiple ? key => onChange(String(key)) : undefined}
            shouldCloseOnSelect={!multiple}
            aria-label={label}
          >
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
      <RButton className="rp-select">
        <SelectValue>{({selectedItem}) => (selectedItem ? <ItemLabel i={selectedItem as Item} /> : value)}</SelectValue>
        <ChevronDown />
      </RButton>
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
// A ranked row: label, value, a thin fill. With `onPress` it is a toggle in the same clothes, for lists
// where picking a row narrows something else (the flow map pins a path this way).
export function Bar({
  label,
  value,
  pct,
  color,
  icon,
  selected,
  dim,
  onPress,
  ...rest
}: {
  label: ReactNode;
  value: string;
  pct: number;
  color: string;
  icon?: ReactNode;
  selected?: boolean;
  dim?: boolean;
  onPress?: (selected: boolean) => void;
} & Record<`data-${string}`, string | undefined>) {
  const body = (
    <>
      <div className="top">
        <span className="l">
          {icon && <span className="ic">{icon}</span>}
          {typeof label === 'string' ? <TextTooltip>{label}</TextTooltip> : label}
        </span>
        <span className="v">{value}</span>
      </div>
      <div className="track" aria-hidden="true">
        <div className="fill" style={{width: `${Math.max(0, Math.min(100, pct))}%`, background: color}} />
      </div>
    </>
  );
  if (onPress)
    return (
      <ToggleButton className="rp-bar pressable" isSelected={!!selected} onChange={onPress} data-dim={dim ? '' : undefined} {...rest}>
        {body}
      </ToggleButton>
    );
  return (
    <div className="rp-bar" data-dim={dim ? '' : undefined} {...rest}>
      {body}
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
  ResizableTableContainer,
  ColumnResizer,
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
      <RButton className="rp-selectbtn">
        <SelectValue>{({selectedItem}) => (selectedItem ? <ItemLabel i={selectedItem as Item} /> : value)}</SelectValue>
        <ChevronDown />
      </RButton>
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
  return <TextTooltip className={cx('rp-badge', tone, className)}>{children}</TextTooltip>;
}
// A whole card as one link: a tile that opens the page it summarises.
export function CardLink({href, label, children}: {href: string; label: string; children: ReactNode}) {
  return (
    <RLink href={href} aria-label={label} className="rp-card rp-card-link">
      {children}
    </RLink>
  );
}
// `row` keeps each label beside its value on one line, for a strip that sits next to other one-line controls.
export function Kv({items, inline, row}: {items: Array<[string, string]>; inline?: boolean; row?: boolean}) {
  return (
    <div className={cx('rp-kv', (inline || row) && 'inline', row && 'row')}>
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
          <TextTooltip>{name}</TextTooltip>
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

// Column minima include cell padding; grow weights their fractional share (zero keeps the minimum).
// `drop` orders which columns give way first when the container is narrower than the minima add up to;
// a column without it always stays. Tables never scroll sideways on a desktop.
export type Col = {id: string; label: string; minWidth: number; grow?: number; isRowHeader?: boolean; align?: 'end'; drop?: number};

export function fitColumns<C extends {id: string; minWidth: number; drop?: number}>(cols: C[], width: number | null): C[] {
  if (width === null) return cols;
  const kept = new Set(cols.map(column => column.id));
  let total = cols.reduce((sum, column) => sum + column.minWidth, 0);
  for (const column of [...cols].filter(column => column.drop).sort((a, b) => a.drop! - b.drop!)) {
    if (total <= width) break;
    kept.delete(column.id);
    total -= column.minWidth;
  }
  return cols.filter(column => kept.has(column.id));
}

// The content width of an element, tracked through resizes; null until measured.
export function useContentWidth<E extends HTMLElement>() {
  const ref = useRef<E>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => setWidth(Math.floor(entries[0].contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
export function DataTable<T extends {id: string}>({
  label,
  cols,
  rows,
  render,
  height = 442,
  selected,
  onSelect,
  selectOnFocus,
  empty,
  loading
}: {
  label: string;
  cols: Col[];
  rows: T[];
  render: (r: T) => ReactNode[];
  height?: number;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  // Arrow keys select as they move (a list with its detail beside it); otherwise Enter or Space selects.
  selectOnFocus?: boolean;
  empty?: string;
  loading?: boolean;
}) {
  const t = useT();
  const keys: Selection = selected ? new Set([selected]) : new Set();
  const [ref, width] = useContentWidth<HTMLDivElement>();
  const shown = useMemo(() => fitColumns(cols, width), [cols, width]);
  const index = new Map(cols.map((column, i) => [column.id, i]));
  // A short list takes only the height of its rows; `height` is the ceiling before the table scrolls.
  const fitted = Math.min(height, 41 + Math.max(rows.length, 2) * 40);
  return (
    <ResizableTableContainer ref={ref} className="rp-table" style={{height: fitted}}>
      <Table
        aria-label={label}
        selectionMode={onSelect ? 'single' : 'none'}
        selectionBehavior={selectOnFocus ? 'replace' : 'toggle'}
        selectedKeys={keys}
        onSelectionChange={k => onSelect && onSelect(k === 'all' ? null : k.size ? String([...k][0]) : null)}
        disallowEmptySelection={!!onSelect}
      >
        <TableHeader>
          {shown.map(c => (
            <Column
              key={c.id}
              id={c.id}
              isRowHeader={c.isRowHeader}
              className={c.align === 'end' ? 'end' : undefined}
              defaultWidth={`${c.minWidth * (c.grow ?? (c.isRowHeader ? 2 : 1))}fr`}
              minWidth={c.minWidth}
            >
              <span className="rp-th">{c.label}</span>
              <ColumnResizer className="rp-resizer" aria-label={t('ui.resizeColumn', {name: c.label})} />
            </Column>
          ))}
        </TableHeader>
        <TableBody
          items={rows}
          dependencies={[shown]}
          renderEmptyState={() => (loading ? <Loading /> : <div className="rp-empty">{empty ?? t('ui.empty')}</div>)}
        >
          {r => {
            const cells = render(r);
            return (
              <Row id={r.id}>
                {shown.map(c => {
                  const cell = cells[index.get(c.id)!];
                  return (
                    <Cell key={c.id} className={c.align === 'end' ? 'end' : undefined}>
                      {typeof cell === 'string' ? <TextTooltip>{cell}</TextTooltip> : cell}
                    </Cell>
                  );
                })}
              </Row>
            );
          }}
        </TableBody>
      </Table>
    </ResizableTableContainer>
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
      {expanded && <RButton className="rp-toast-underlay" aria-label={labels.collapse} onPress={() => setExpanded(false)} />}
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
        <div className="rp-toast-list">
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
                inert={background || t.exiting || undefined}
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

// Tabs: the selected key is the caller's (URL-backed), panels render only when selected.
export function Tabs({
  label,
  items,
  value,
  onChange
}: {
  label: string;
  items: Array<{id: string; label: string; content: ReactNode}>;
  value: string;
  onChange: (id: string) => void;
}) {
  // The marker lives beside the TabList, not inside it: anything inside is part of the RAC collection and re-renders the tabs.
  const [ref, pos] = useSlider(value, '[data-selected]');
  return (
    <RTabs className="rp-tabs" selectedKey={value} onSelectionChange={key => onChange(String(key))}>
      <div className="rp-tabbar" ref={ref}>
        {pos && <span className="rp-slider" style={{translate: `${pos.x}px 0`, width: pos.w}} />}
        <TabList aria-label={label} className="rp-tablist">
          {items.map(item => (
            <Tab key={item.id} id={item.id} className="rp-tab">
              {item.label}
            </Tab>
          ))}
        </TabList>
      </div>
      {items.map(item => (
        <TabPanel key={item.id} id={item.id} className="rp-tabpanel">
          {item.content}
        </TabPanel>
      ))}
    </RTabs>
  );
}

// From this width the selected item's detail sits beside the list; below it, the detail is a drawer and
// selection must not follow keyboard focus, or arrowing through the list would keep opening the drawer.
export const panelQuery = '(min-width: 1200px)';

// A wrapping row of toggle chips with one selectable at a time; a count sits after the label when given.
export function Chips({
  label,
  items,
  value,
  onChange
}: {
  label: string;
  items: Array<{id: string; label: string; count?: string; countLabel?: string; icon?: ReactNode}>;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <ToggleButtonGroup
      className="rp-chips"
      aria-label={label}
      selectionMode="single"
      selectedKeys={value ? [value] : []}
      onSelectionChange={keys => {
        const next = [...keys][0];
        onChange(next == null ? null : String(next));
      }}
    >
      {items.map(item => (
        <ToggleButton key={item.id} id={item.id} className="rp-btn small">
          {item.icon}
          <span className="rp-truncate">{item.label}</span>
          {item.count !== undefined && (
            <span className="n" title={item.countLabel}>
              {item.count}
            </span>
          )}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

// Hands the browser a file to save; the URL is released once the click has been dispatched.
export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csvLine(values: Array<string | number | null | undefined>): string {
  return values.map(value => (value == null ? '' : /[",\n]/.test(String(value)) ? '"' + String(value).replace(/"/g, '""') + '"' : String(value))).join(',');
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => {
    const list = matchMedia(query);
    const on = () => setMatches(list.matches);
    on();
    list.addEventListener('change', on);
    return () => list.removeEventListener('change', on);
  }, [query]);
  return matches;
}

// Detail beside a list: a non-modal side panel when the page is wide, a dismissable drawer otherwise.
// Place it as the last child of a `.rp-with-panel` container; the container lays the list and panel out.
export function DetailPanel({open, title, onClose, children}: {open: boolean; title: string; onClose: () => void; children: ReactNode}) {
  const t = useT();
  const wide = useMediaQuery(panelQuery);
  useEffect(() => {
    if (!open || !wide) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement | null)?.closest('[role="dialog"], input, textarea, [role="listbox"], [role="menu"]')) onClose();
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [open, wide, onClose]);
  if (!open) return null;
  const head = (
    <div className="rp-row">
      <h3 className="rp-h3">{title}</h3>
      <RButton className="rp-btn quiet icon close" aria-label={t('close')} onPress={onClose}>
        <Close />
      </RButton>
    </div>
  );
  if (wide)
    return (
      <aside className="rp-panel rp-card" aria-label={title}>
        {head}
        {children}
      </aside>
    );
  return (
    <ModalOverlay className="rp-underlay rp-drawer-underlay" isDismissable isOpen onOpenChange={o => !o && onClose()}>
      <Modal>
        <Dialog className="rp-dialog rp-drawer" aria-label={title}>
          {head}
          {children}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
