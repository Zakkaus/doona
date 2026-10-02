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
  Separator,
  SubmenuTrigger,
  useLocale,
  TooltipTrigger,
  Focusable,
  type Key
} from 'react-aria-components';
import ChevronDown from './icons/ChevronDown';
import {Tip, buttonClass, TextTooltip, useReasonId} from './Button';
import {Check} from './Check';
import {useMediaQuery} from './hooks';
import {LazySearchList, preloadSearchList} from './LazySearchList';
import {longList} from './longList';
import {useT, type Translator} from '../i18n';
import {ItemText, type Item} from './Select';

export const pickMenuKey = (on: (k: string) => void) => (k: 'all' | Set<Key>) => {
  if (k === 'all') return;
  const v = [...k][0];
  if (v != null) on(String(v));
};
export function MenuChoice({item, children, onAction}: {item: Item; children?: ReactNode; onAction?: () => void}) {
  return (
    <MenuItem id={item.id} className="rp-item" textValue={item.label} onAction={onAction}>
      <Check />
      <ItemText i={item}>{children}</ItemText>
    </MenuItem>
  );
}

type MenuButtonProps = {
  children: ReactNode;
  content: ReactNode;
  label: string;
  quiet?: boolean;
  small?: boolean;
  chevron?: boolean;
  isDisabled?: boolean;
  appearance?: 'select';
  placement?: PopoverProps['placement'];
  // How many of the menu's choices are in force, as S2 badges an ActionButton; zero shows none. The label must say
  // it too, since the badge is hidden from assistive technology.
  count?: number;
  // Runs when the trigger is hovered or focused, ahead of a press, such as to load what the menu will need.
  onIntent?: () => void;
};
export function MenuButton({
  children,
  content,
  label,
  quiet,
  small,
  chevron = true,
  isDisabled,
  appearance,
  placement = 'bottom end',
  count,
  onIntent
}: MenuButtonProps) {
  const badge = count ? (
    <span className="rp-count" aria-hidden="true">
      {count}
    </span>
  ) : null;
  const reasonId = useReasonId(isDisabled);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const trigger = (
    <RButton
      ref={triggerRef}
      className={appearance ? 'rp-select' : buttonClass({quiet, small, icon: !chevron})}
      aria-label={label}
      aria-describedby={reasonId}
      isDisabled={isDisabled}
      onHoverStart={onIntent}
      onFocus={onIntent}
    >
      {children}
      {badge}
      {chevron && <ChevronDown />}
    </RButton>
  );
  return (
    <MenuTrigger>
      {chevron ? (
        trigger
      ) : (
        <TooltipTrigger delay={400}>
          <Focusable>
            <span className="rp-tipwrap" tabIndex={-1} data-passive="">
              {trigger}
            </span>
          </Focusable>
          <Tip triggerRef={triggerRef}>{label}</Tip>
        </TooltipTrigger>
      )}
      <Popover className="rp-popover rp-list-popover" placement={placement}>
        {content}
      </Popover>
    </MenuTrigger>
  );
}

export type ChoiceSection = {
  title: string;
  hideHeader?: boolean;
  items: Item[];
  value: string;
  selectionMode?: 'single' | 'none';
  onChange?: (key: string) => void;
};
// A row that opens its own menu of choices, showing the current one, after S2's ActionMenu with submenus.
// `searchLabel` names the filter field of a list long enough to get one, by what the submenu lists.
export type ChoiceSubmenu = {
  label: string;
  icon?: ReactNode;
  sections: ChoiceSection[];
  searchLabel?: string;
  onAction?: (key: string) => void;
  actions?: ChoiceAction[];
};
// A command row closes the menu, including when interleaved with submenus.
export type ChoiceAction = {label: string; icon?: ReactNode; onAction: () => void};
type SubmenuEntries = Array<ChoiceSubmenu | ChoiceAction>;

function SectionMenu({
  label,
  labelledBy,
  sections: source,
  headers = true,
  focusedByCaller,
  onAction,
  searchLabel,
  actions = []
}: {
  label: string;
  labelledBy?: string;
  actions?: ChoiceAction[];
  sections: ChoiceSection[] | (() => ChoiceSection[]);
  headers?: boolean;
  // The caller moves focus itself, so the menu does not take it to its first item as a trigger's menu does.
  focusedByCaller?: boolean;
  onAction?: (key: string) => void;
  searchLabel?: string;
}) {
  const sections = typeof source === 'function' ? source() : source;
  const long = !!searchLabel && longList(itemCount(sections));
  const menu = (
    <Menu
      aria-label={label}
      aria-labelledby={labelledBy ?? ''}
      className={long ? 'rp-menu-scroll' : undefined}
      // eslint-disable-next-line jsx-a11y/no-autofocus -- false only: the caller places focus instead of the trigger
      autoFocus={focusedByCaller ? false : undefined}
    >
      {sections.map(section => (
        <MenuSection
          key={section.title}
          id={section.title}
          aria-label={headers && !section.hideHeader ? undefined : section.title}
          selectionMode={section.selectionMode ?? 'single'}
          selectedKeys={[section.value]}
          onSelectionChange={section.onChange && pickMenuKey(section.onChange)}
        >
          {headers && !section.hideHeader && <Header className="rp-sec-h">{section.title}</Header>}
          {section.items.map(item => (
            <MenuChoice key={item.id} item={item} onAction={onAction && (() => onAction(item.id))} />
          ))}
        </MenuSection>
      ))}
      {actions.length > 0 && <Separator className="rp-hrule" />}
      {actions.map((action, index) => (
        <ActionItem key={action.label} id={actionKey(index)} {...action} />
      ))}
    </Menu>
  );
  return long ? <LazySearchList label={searchLabel}>{menu}</LazySearchList> : menu;
}
const itemCount = (sections: ChoiceSection[]) => sections.reduce((n, section) => n + section.items.length, 0);

// The chosen item, named with its section when the submenu has several and the item alone would not say which.
export function chosen(sections: ChoiceSection[], t: Translator) {
  for (const section of sections) {
    const item = section.items.find(i => i.id === section.value);
    if (item) return sections.length > 1 && item.label !== section.title ? t('ui.sectionChoice', {section: section.title, item: item.label}) : item.label;
  }
  return '';
}

const ActionItem = ({id, label, icon, onAction}: ChoiceAction & {id: string}) => (
  <MenuItem id={id} className="rp-item rp-subitem" textValue={label} onAction={onAction} shouldCloseOnSelect>
    <span className="ic">{icon}</span>
    <TextTooltip>{label}</TextTooltip>
  </MenuItem>
);
const actionKey = (index: number) => `/action-${index}`;

const SubmenuItem = ({id, label, icon, sections}: ChoiceSubmenu & {id?: string}) => {
  const t = useT();
  return (
    <MenuItem id={id} className="rp-item rp-subitem" textValue={label}>
      <span className="ic">{icon}</span>
      <TextTooltip>{label}</TextTooltip>
      <span className="desc">
        {chosen(sections, t)}
        <ChevronDown className="rp-chev-end" />
      </span>
    </MenuItem>
  );
};

// On a phone a submenu beside its row would leave the screen, so the submenu replaces the menu in the same popover,
// with a back row on top, as S2's menus do on mobile. The arrow toward the line's end (right, or left in right-to-left
// text) or Enter opens a submenu; the other arrow or Escape goes back, as React Aria's own submenus do.
const phone = '(max-width: 639px)';
function SubmenuMenu({label, submenus: source, actions = []}: {label: string; submenus: SubmenuEntries | (() => SubmenuEntries); actions?: ChoiceAction[]}) {
  const submenus = typeof source === 'function' ? source() : source;
  const t = useT();
  const inline = useMediaQuery(phone);
  const [into, back] = useLocale().direction === 'rtl' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft'];
  // The open submenu, and the row just left, which takes focus back.
  const [{open, left}, setView] = useState<{open: number | null; left: number | null}>({open: null, left: null});
  const root = useRef<HTMLDivElement>(null);
  const title = useId();
  // The wrapper holds focus while one view replaces the other, so the popover does not see focus lost and move it.
  const go = (to: number | null) => {
    root.current?.focus();
    setView({open: to, left: to == null ? open : null});
  };
  // A submenu opens on its current choice; back on the list, focus returns to the row that opened the submenu. The
  // menu the trigger would focus on its first item is told not to, and its items render a pass after mounting, so the
  // focus waits a frame and gives way if a key has moved it since.
  useEffect(() => {
    const el = root.current;
    if (!el || (open == null && left == null)) return;
    const target = open == null ? `[data-key="${left}"]` : '[aria-checked="true"], [role="menuitem"]';
    const frame = requestAnimationFrame(() => {
      if (document.activeElement === el) el.querySelector<HTMLElement>(target)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, left]);
  if (!inline)
    return (
      <Menu aria-label={label} aria-labelledby="">
        {submenus.map((submenu, index) =>
          'sections' in submenu ? (
            <SubmenuTrigger key={submenu.label}>
              <SubmenuItem {...submenu} />
              <Popover className="rp-popover rp-list-popover" offset={-4} crossOffset={-9}>
                <SectionMenu {...submenu} headers={submenu.sections.length > 1} />
              </Popover>
            </SubmenuTrigger>
          ) : (
            <ActionItem key={submenu.label} id={String(index)} {...submenu} />
          )
        )}
        {actions.map((action, index) => (
          <ActionItem key={action.label} id={actionKey(index)} {...action} />
        ))}
      </Menu>
    );
  const submenu = open == null ? null : submenus[open];
  if (submenu && 'sections' in submenu) {
    const leave = () => go(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== back && e.key !== 'Escape') return;
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
        <SectionMenu {...submenu} labelledBy={title} headers={submenu.sections.length > 1} focusedByCaller />
      </div>
    );
  }
  // An action row's key is not a submenu index; the row runs its own command.
  const index = (key: string | undefined) => (key != null && submenus[Number(key)] && 'sections' in submenus[Number(key)] ? Number(key) : null);
  const onKey = (e: KeyboardEvent) => {
    const key = index((e.target as HTMLElement).dataset.key);
    if (e.key !== into || key == null) return;
    e.preventDefault();
    go(key);
  };
  return (
    <div ref={root} className="rp-drill" tabIndex={-1} onKeyDownCapture={onKey}>
      <Menu
        aria-label={label}
        aria-labelledby=""
        // eslint-disable-next-line jsx-a11y/no-autofocus -- false only, on return: focus goes back to the row just left
        autoFocus={left == null ? undefined : false}
        shouldCloseOnSelect={false}
        onAction={key => {
          const open = index(String(key));
          if (open != null) go(open);
        }}
      >
        {submenus.map((submenu, index) =>
          'sections' in submenu ? (
            <SubmenuItem key={submenu.label} id={String(index)} {...submenu} />
          ) : (
            <ActionItem key={submenu.label} id={String(index)} {...submenu} />
          )
        )}
        {actions.map((action, index) => (
          <ActionItem key={action.label} id={actionKey(index)} {...action} />
        ))}
      </Menu>
    </div>
  );
}

// The flat menu's items, read only once it opens: a table row's choices can cost a pass over the whole table.
type Items = Item[] | (() => Item[]);
function FlatMenu({
  label,
  items,
  selectionMode,
  value,
  onChange,
  onAction,
  searchLabel
}: {
  label: string;
  items: Items;
  selectionMode: 'none' | 'single' | 'multiple';
  value?: string | string[];
  onChange?: (key: string) => void;
  onAction?: (key: string) => void;
  searchLabel?: string;
}) {
  const list = typeof items === 'function' ? items() : items;
  const long = !!searchLabel && longList(list.length);
  const menu = (
    <Menu
      aria-label={label}
      aria-labelledby=""
      className={long ? 'rp-menu-scroll' : undefined}
      selectionMode={selectionMode}
      disallowEmptySelection={selectionMode === 'single'}
      selectedKeys={value == null ? undefined : typeof value === 'string' ? [value] : value}
      onSelectionChange={onChange && pickMenuKey(onChange)}
      // Several choices are picked one after another, so the menu stays open, as S2's does.
      shouldCloseOnSelect={selectionMode === 'multiple' ? false : undefined}
      onAction={onAction && (key => onAction(String(key)))}
    >
      {list.map(item => (
        <MenuChoice key={item.id} item={item} />
      ))}
    </Menu>
  );
  return long ? <LazySearchList label={searchLabel}>{menu}</LazySearchList> : menu;
}

type NotFlat = {items?: never; selectionMode?: never; value?: never; onChange?: never};
type NoActions = {actions?: never};
// Explicit menu names clear MenuTrigger's inherited aria-labelledby, so they can differ from the trigger.
// A menu of choices: flat, in titled sections each with its own selection, or as rows that each open a submenu of
// sections. A flat menu marks one choice (`selectionMode` single, the default) or several (`multiple`, each pick
// toggling one through `onAction`); with neither `value` nor `selectionMode` it is an action menu that only runs
// `onAction`. `onAction` hears every pick, including one of the already chosen item, for menus where picking it again
// clears it. With `searchLabel`, naming its filter field by what it filters (a submenu names its own), a list of
// user data longer than twelve items can be filtered, as the node menus are; a shorter list stays plain.
export function ChoiceMenu({
  items,
  selectionMode,
  value,
  onChange,
  sections,
  submenus,
  actions,
  onAction,
  searchLabel,
  triggerLabel,
  ...props
}: Omit<MenuButtonProps, 'content' | 'onIntent'> & {searchLabel?: string; triggerLabel?: string} & (
    | {
        items: Items;
        selectionMode?: 'single';
        value: string;
        onChange: (key: string) => void;
        onAction?: (key: string) => void;
        sections?: never;
        submenus?: never;
        actions?: never;
      }
    | (NoActions & {
        items: Items;
        selectionMode: 'multiple';
        value: string[];
        onAction: (key: string) => void;
        onChange?: never;
        sections?: never;
        submenus?: never;
      })
    | (NoActions & {items: Items; onAction: (key: string) => void; selectionMode?: never; value?: never; onChange?: never; sections?: never; submenus?: never})
    | (NotFlat & NoActions & {sections: ChoiceSection[] | (() => ChoiceSection[]); onAction?: (key: string) => void; submenus?: never})
    | (NotFlat & {submenus: SubmenuEntries | (() => SubmenuEntries); actions?: ChoiceAction[]; onAction?: never; sections?: never})
  )) {
  // A list read only once the menu opens is not counted ahead; its search loads when it first opens long.
  const long = sections
    ? Array.isArray(sections) && longList(itemCount(sections))
    : submenus
      ? Array.isArray(submenus) && submenus.some(submenu => 'sections' in submenu && !!submenu.searchLabel && longList(itemCount(submenu.sections)))
      : Array.isArray(items) && longList(items.length);
  return (
    <MenuButton
      {...props}
      label={triggerLabel ?? props.label}
      onIntent={searchLabel && long ? preloadSearchList : undefined}
      content={
        submenus ? (
          <SubmenuMenu label={props.label} submenus={submenus} actions={actions} />
        ) : sections ? (
          <SectionMenu label={props.label} sections={sections} onAction={onAction} searchLabel={searchLabel} />
        ) : (
          <FlatMenu
            label={props.label}
            items={items}
            selectionMode={selectionMode ?? (value == null ? 'none' : 'single')}
            value={value}
            onChange={onChange}
            onAction={onAction}
            searchLabel={searchLabel}
          />
        )
      }
    />
  );
}
