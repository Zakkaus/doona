import {Suspense, useMemo, type ComponentProps} from 'react';
import {Header, Menu, MenuSection} from 'react-aria-components';
import {MenuButton, MenuChoice, pickMenuKey, TextField} from '../../ui/ui';
import {preloadable} from '../../ui/preloadable';
import {useT} from '../../i18n';
import {menuViews} from '../shared/nodeMenu';
import type {NodeSearch} from './NodeSearch';
import type {ActivityNodeMenu} from './view';

type Model = ActivityNodeMenu & {setChosen: (id: string) => void};

// The search for a long list stays out of the startup bundle; hovering or focusing the trigger loads it ahead of the
// press.
const nodeSearch = preloadable<ComponentProps<typeof NodeSearch>>(() => import('./NodeSearch').then(module => ({default: module.NodeSearch})));
const preloadNodeSearch = () => void nodeSearch.preload().catch(() => undefined);

export function NodeMenu({model: vm, label}: {model: Model; label: string}) {
  const t = useT();
  // The popover renders its content only while open, so the list below is not rebuilt on polls while closed.
  const menu = <NodeList model={vm} label={label} />;
  const warm = vm.big ? preloadNodeSearch : undefined;
  return (
    <span className="rp-contents" onPointerEnter={warm} onFocus={warm}>
      <MenuButton
        appearance="select"
        placement="bottom start"
        label={label}
        content={
          vm.big ? (
            <Suspense
              fallback={
                <>
                  <TextField search label={t('policy.filter')} isDisabled className="rp-menu-search" />
                  <div className="rp-menu-scroll rp-menu-pending" />
                </>
              }
            >
              <nodeSearch.Component>{menu}</nodeSearch.Component>
            </Suspense>
          ) : (
            menu
          )
        }
      >
        <span className="rp-il">
          {/* A narrow tile can ellipsise this; the menu it opens lists every node by its full name. */}
          <span className="rp-truncate">{vm.name}</span>
        </span>
      </MenuButton>
    </span>
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
