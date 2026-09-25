import {useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode} from 'react';
import {
  type PopoverProps,
  Button as RButton,
  Header,
  Menu,
  MenuItem,
  MenuSection,
  MenuTrigger,
  Popover,
  Select,
  SubmenuTrigger,
  SelectValue,
  ListBox,
  ListBoxItem,
  Label,
  type Key
} from 'react-aria-components';
import ChevronDown from './icons/ChevronDown';
import {cx} from './cx';
import {Button, TextTooltip} from './Button';
import {Check} from './Fields';
import {useMediaQuery} from './hooks';
import {useT} from '../i18n';

type Item = {id: string; label: string; desc?: string; icon?: ReactNode};
const ItemLabel = ({i}: {i: Item}) => (
  <span className="rp-il">
    {i.icon && <span className="ic">{i.icon}</span>}
    <TextTooltip>{i.label}</TextTooltip>
  </span>
);
const ItemBody = ({i}: {i: Item}) => (
  <>
    <Check />
    <ItemLabel i={i} />
    {i.desc && <span className="desc">{i.desc}</span>}
  </>
);
// With a layout the label is visible and a real Label, so pressing it opens the picker; without one it only names it.
function SelectBody({
  items,
  value,
  onChange,
  label,
  isDisabled,
  className,
  layout
}: Picked & {items: Item[]; label: string; isDisabled?: boolean; className: string; layout?: 'field' | 'side'}) {
  return (
    <Select
      aria-label={layout ? undefined : label}
      className={layout === 'field' ? 'rp-field' : layout === 'side' ? 'rp-cluster' : undefined}
      selectedKey={value}
      onSelectionChange={(k: Key | null) => {
        if (k != null) onChange(String(k));
      }}
      isDisabled={isDisabled}
    >
      {layout && <Label className={layout === 'field' ? 'lbl' : 'rp-label'}>{label}</Label>}
      <RButton className={className}>
        <SelectValue>{({selectedItem}) => (selectedItem ? <ItemLabel i={selectedItem as Item} /> : value)}</SelectValue>
        <ChevronDown />
      </RButton>
      <Popover className="rp-popover" placement="bottom start">
        <ListBox items={items}>
          {i => (
            <ListBoxItem id={i.id} className="rp-item" textValue={i.label}>
              <ItemBody i={i} />
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  );
}
type Picked = {value: string; onChange: (k: string) => void};
export const pickMenuKey = (on: (k: string) => void) => (k: 'all' | Set<Key>) => {
  if (k === 'all') return;
  const v = [...k][0];
  if (v != null) on(String(v));
};
export function MenuChoice({item, children}: {item: Item; children?: ReactNode}) {
  return (
    <MenuItem id={item.id} className="rp-item" textValue={item.label}>
      <Check />
      <ItemLabel i={item} />
      {children ?? (item.desc && <span className="desc">{item.desc}</span>)}
    </MenuItem>
  );
}

type MenuButtonProps = {
  children: ReactNode;
  content: ReactNode;
  label: string;
  quiet?: boolean;
  chevron?: boolean;
  isDisabled?: boolean;
  appearance?: 'select';
  placement?: PopoverProps['placement'];
};
export function MenuButton({children, content, label, quiet, chevron = true, isDisabled, appearance, placement = 'bottom end'}: MenuButtonProps) {
  return (
    <MenuTrigger>
      {appearance ? (
        <Button appearance={appearance} quiet={quiet} icon={!chevron} label={label} isDisabled={isDisabled}>
          {children}
          {chevron && <ChevronDown />}
        </Button>
      ) : (
        <RButton className={cx('rp-btn', quiet && 'quiet', !chevron && 'icon')} aria-label={label} isDisabled={isDisabled}>
          {children}
          {chevron && <ChevronDown />}
        </RButton>
      )}
      <Popover className="rp-popover" placement={placement}>
        {content}
      </Popover>
    </MenuTrigger>
  );
}

export type ChoiceSection = {title: string; items: Item[]; value: string; onChange?: (key: string) => void};
// A row that opens its own menu of choices, showing the current one, after S2's ActionMenu with submenus.
export type ChoiceSubmenu = {label: string; icon?: ReactNode; sections: ChoiceSection[]};

function SectionMenu({
  label,
  labelledBy,
  sections,
  headers = true,
  onAction
}: {
  label: string;
  labelledBy?: string;
  sections: ChoiceSection[];
  headers?: boolean;
  onAction?: (key: string) => void;
}) {
  return (
    <Menu aria-label={label} aria-labelledby={labelledBy} onAction={onAction && (key => onAction(String(key)))}>
      {sections.map(section => (
        <MenuSection
          key={section.title}
          id={section.title}
          aria-label={headers ? undefined : section.title}
          selectionMode="single"
          selectedKeys={[section.value]}
          onSelectionChange={section.onChange && pickMenuKey(section.onChange)}
        >
          {headers && <Header className="rp-sec-h">{section.title}</Header>}
          {section.items.map(item => (
            <MenuChoice key={item.id} item={item} />
          ))}
        </MenuSection>
      ))}
    </Menu>
  );
}

// The chosen item, named with its section when the submenu has several and the item alone would not say which.
function chosen(sections: ChoiceSection[]) {
  for (const section of sections) {
    const item = section.items.find(i => i.id === section.value);
    if (item) return sections.length > 1 && item.label !== section.title ? `${section.title} ${item.label}` : item.label;
  }
  return '';
}

const SubmenuItem = ({id, label, icon, sections}: ChoiceSubmenu & {id?: string}) => (
  <MenuItem id={id} className="rp-item rp-subitem" textValue={label}>
    <span className="ic">{icon}</span>
    <TextTooltip>{label}</TextTooltip>
    <span className="desc">
      {chosen(sections)}
      <ChevronDown className="rp-chev-end" />
    </span>
  </MenuItem>
);

// On a phone a submenu beside its row would leave the screen, so the submenu replaces the menu in the same popover,
// with a back row on top, as S2's menus do on mobile. ArrowRight or Enter opens a submenu, ArrowLeft or Escape goes back.
const phone = '(max-width: 639px)';
function SubmenuMenu({label, submenus}: {label: string; submenus: ChoiceSubmenu[]}) {
  const t = useT();
  const inline = useMediaQuery(phone);
  const [open, setOpen] = useState<number | null>(null);
  const back = useRef<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const title = useId();
  // The wrapper holds focus while one view replaces the other, so the popover does not see focus lost and move it.
  const go = (to: number | null) => {
    root.current?.focus();
    setOpen(to);
  };
  // A submenu opens on its current choice; back on the list, focus returns to the row that opened the submenu. The
  // menu renders its items a pass after mounting, so the focus waits a frame.
  useEffect(() => {
    const el = root.current;
    if (!el || (open == null && back.current == null)) return;
    const target = open == null ? `[data-key="${back.current}"]` : '[aria-checked="true"]';
    back.current = null;
    const frame = requestAnimationFrame(() => el.querySelector<HTMLElement>(target)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);
  if (!inline)
    return (
      <Menu aria-label={label}>
        {submenus.map(submenu => (
          <SubmenuTrigger key={submenu.label}>
            <SubmenuItem {...submenu} />
            <Popover className="rp-popover" offset={-4} crossOffset={-9}>
              <SectionMenu label={submenu.label} sections={submenu.sections} headers={submenu.sections.length > 1} />
            </Popover>
          </SubmenuTrigger>
        ))}
      </Menu>
    );
  const submenu = open == null ? null : submenus[open];
  if (submenu) {
    const leave = () => {
      back.current = open;
      go(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      leave();
    };
    return (
      <div ref={root} className="rp-drill" tabIndex={-1} onKeyDownCapture={onKey}>
        <RButton className="rp-item rp-drill-back" aria-label={t('ui.back')} onPress={leave}>
          <ChevronDown className="rp-chev-start" />
          <span id={title}>{submenu.label}</span>
        </RButton>
        {/* Named by its title, not by the menu button the trigger would name it after. */}
        <SectionMenu label={submenu.label} labelledBy={title} sections={submenu.sections} headers={submenu.sections.length > 1} />
      </div>
    );
  }
  const onKey = (e: KeyboardEvent) => {
    const key = (e.target as HTMLElement).dataset.key;
    if (e.key !== 'ArrowRight' || key == null) return;
    e.preventDefault();
    go(Number(key));
  };
  return (
    <div ref={root} className="rp-drill" tabIndex={-1} onKeyDownCapture={onKey}>
      <Menu aria-label={label} shouldCloseOnSelect={false} onAction={key => go(Number(key))}>
        {submenus.map((submenu, index) => (
          <SubmenuItem key={submenu.label} id={String(index)} {...submenu} />
        ))}
      </Menu>
    </div>
  );
}

// A menu of choices: flat, in titled sections each with its own selection, or as rows that each open a submenu of
// sections. `onAction` hears every pick, including one of the already chosen item, for menus where picking it again
// clears it.
export function ChoiceMenu({
  items,
  value,
  onChange,
  sections,
  submenus,
  onAction,
  ...props
}: Omit<MenuButtonProps, 'content'> &
  (
    | {items: Item[]; value: string; onChange: (key: string) => void; sections?: never; submenus?: never}
    | {sections: ChoiceSection[]; items?: never; value?: never; onChange?: never; submenus?: never}
    | {submenus: ChoiceSubmenu[]; items?: never; value?: never; onChange?: never; sections?: never}
  ) & {
    onAction?: (key: string) => void;
  }) {
  return (
    <MenuButton
      {...props}
      content={
        submenus ? (
          <SubmenuMenu label={props.label} submenus={submenus} />
        ) : sections ? (
          <SectionMenu label={props.label} sections={sections} onAction={onAction} />
        ) : (
          <Menu
            aria-label={props.label}
            selectionMode="single"
            selectedKeys={[value]}
            onSelectionChange={pickMenuKey(onChange)}
            onAction={onAction && (key => onAction(String(key)))}
          >
            {items.map(item => (
              <MenuChoice key={item.id} item={item} />
            ))}
          </Menu>
        )
      }
    />
  );
}
export function InlineSelect({items, value, onChange, label}: {items: Item[]; value: string; onChange: (k: string) => void; label: string}) {
  return <SelectBody items={items} value={value} onChange={onChange} label={label} className="rp-select" />;
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
  return (
    <SelectBody
      items={items}
      value={value}
      onChange={onChange}
      label={label}
      isDisabled={isDisabled}
      className="rp-selectbtn"
      layout={bare ? undefined : side ? 'side' : 'field'}
    />
  );
}
