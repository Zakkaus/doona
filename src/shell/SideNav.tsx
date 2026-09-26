import {memo, type CSSProperties, type RefObject} from 'react';
import {Link} from '../ui/ui';
import {BackendIndicator} from './Backend';
import {warmPage} from './registry';
import type {BackendView, NavGroup} from './view';

type SideNavProps = {
  groups: NavGroup[];
  busy: boolean;
  backend: BackendView;
  honk: () => void;
  navRef: RefObject<HTMLElement | null>;
  navStyle: CSSProperties | undefined;
};

// Navigation follows the open page, not its query: a tab or filter change leaves it alone.
export const SideNav = memo(function SideNav({groups, busy, backend, honk, navRef, navStyle}: SideNavProps) {
  return (
    <nav className="rp-side" ref={navRef} aria-busy={busy || undefined}>
      {navStyle && <span className="rp-nav-slider" style={navStyle} />}
      {groups.map(group => (
        <div key={group.id} data-group={group.id}>
          <div className="rp-group">{group.label}</div>
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
        </div>
      ))}
      <div className="rp-side-grow" />
      <BackendIndicator backend={backend} honk={honk} />
    </nav>
  );
});
