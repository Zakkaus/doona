import {useMemo} from 'react';
import {Autocomplete, Header, ListLayout, Menu, MenuSection, Virtualizer, useFilter} from 'react-aria-components';
import {MenuButton, MenuChoice, pickMenuKey, TextField} from '../../ui/ui';
import {useT} from '../../i18n';
import {menuViews} from '../policies/view';
import type {ActivityNodeMenu} from './view';

type Model = ActivityNodeMenu & {setChosen: (id: string) => void};

export function NodeMenu({model: vm, label}: {model: Model; label: string}) {
  const t = useT();
  const {contains} = useFilter({sensitivity: 'base'});
  // The popover renders its content only while open, so the list below is not rebuilt on polls while closed.
  const menu = <NodeList model={vm} label={label} />;
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

function NodeList({model: vm, label}: {model: Model; label: string}) {
  const t = useT();
  const views = useMemo(() => menuViews(vm.options, t), [vm.options, t]);
  const item = (node: (typeof views.items)[number]) => (
    <MenuChoice key={node.id} item={node}>
      <span className={node.className}>{node.description}</span>
    </MenuChoice>
  );
  return (
    <Menu
      aria-label={label}
      className="rp-menu-scroll"
      selectionMode={vm.big ? undefined : 'single'}
      selectedKeys={vm.big ? undefined : [vm.id]}
      onSelectionChange={vm.big ? undefined : pickMenuKey(vm.setChosen)}
    >
      {vm.big
        ? views.sections.map(section => (
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
        : views.items.map(item)}
    </Menu>
  );
}
