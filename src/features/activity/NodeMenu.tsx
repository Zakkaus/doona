import {Autocomplete, Header, ListLayout, Menu, MenuSection, Virtualizer, useFilter} from 'react-aria-components';
import {MenuButton, MenuChoice, pickMenuKey, TextField} from '../../ui/ui';
import {useT} from '../../i18n';
import type {ActivityNodeMenu} from './view';

export function NodeMenu({model: vm, label}: {model: ActivityNodeMenu & {setChosen: (id: string) => void}; label: string}) {
  const t = useT();
  const {contains} = useFilter({sensitivity: 'base'});
  const item = (node: (typeof vm.menu.items)[number]) => (
    <MenuChoice key={node.id} item={node}>
      <span className={node.className}>{node.description}</span>
    </MenuChoice>
  );
  const menu = (
    <Menu
      aria-label={label}
      className="rp-menu-scroll"
      selectionMode={vm.big ? undefined : 'single'}
      selectedKeys={vm.big ? undefined : [vm.id]}
      onSelectionChange={vm.big ? undefined : pickMenuKey(vm.setChosen)}
    >
      {vm.big
        ? vm.menu.sections.map(section => (
            <MenuSection key={section.title} id={section.title} selectionMode="single" selectedKeys={[vm.id]} onSelectionChange={pickMenuKey(vm.setChosen)}>
              <Header className="rp-sec-h">
                <span className="rp-il">
                  {section.title}
                  <span className="rp-muted">{section.count}</span>
                </span>
              </Header>
              {section.items.map(item)}
            </MenuSection>
          ))
        : vm.menu.items.map(item)}
    </Menu>
  );
  return (
    <MenuButton
      appearance="select"
      placement="bottom start"
      label={label}
      content={
        vm.big ? (
          <Autocomplete filter={contains}>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus follows the user into the opened menu */}
            <TextField search label={t('policy.filter')} autoFocus className="rp-menu-search" />
            <Virtualizer layout={ListLayout} layoutOptions={{rowHeight: 32, headingHeight: 26}}>
              {menu}
            </Virtualizer>
          </Autocomplete>
        ) : (
          menu
        )
      }
    >
      <span className="rp-il">
        <span>{vm.name}</span>
      </span>
    </MenuButton>
  );
}
