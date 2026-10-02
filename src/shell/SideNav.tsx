import {memo, useState, type CSSProperties, type RefObject} from 'react';
import {SidebarWidgets} from './widgets/host';
import {readNavGroups, saveNavGroups} from './navGroups';
import {Disclosure, Link} from '../ui/ui';
import {useMoreBelow} from '../ui/hooks';
import {warmPage} from './registry';
import type {BackendView, NavGroup} from './view';

type SideNavProps = {
  route: string;
  groups: NavGroup[];
  busy: boolean;
  backend: BackendView;
  honk: () => void;
  navRef: RefObject<HTMLDivElement | null>;
  navStyle: CSSProperties | undefined;
};

// Navigation follows the open page, not its query: a tab or filter change leaves it alone.
export const SideNav = memo(function SideNav({route, groups, busy, backend, honk, navRef, navStyle}: SideNavProps) {
  const [collapsed, setCollapsed] = useState(readNavGroups);
  useMoreBelow(navRef);
  return (
    <nav className="rp-side" aria-busy={busy || undefined}>
      <div className="rp-side-links rp-overlay-scroll" ref={navRef}>
        {navStyle && <span className="rp-nav-slider" style={navStyle} />}
        {groups.map(group => (
          <div key={group.id} data-group={group.id}>
            <Disclosure
              variant="nav"
              title={group.label}
              isExpanded={!collapsed.includes(group.id)}
              onExpandedChange={expanded => {
                const next = expanded ? collapsed.filter(id => id !== group.id) : [...collapsed, group.id];
                setCollapsed(next);
                saveNavGroups(next);
              }}
            >
              {group.items.map(item => (
                <Link
                  key={item.id}
                  className="rp-nav"
                  href={item.href}
                  aria-current={item.current ? 'page' : undefined}
                  data-unavailable={item.unavailable ? '' : undefined}
                  aria-description={item.description}
                  onHoverStart={() => warmPage(item.id)}
                  onFocus={() => warmPage(item.id)}
                >
                  <item.Icon />
                  {item.label}
                </Link>
              ))}
            </Disclosure>
          </div>
        ))}
      </div>
      <SidebarWidgets route={route} backend={backend} honk={honk} />
    </nav>
  );
});
