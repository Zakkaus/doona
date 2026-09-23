import {memo, type CSSProperties, type RefObject} from 'react';
import {Link as RLink} from 'react-aria-components';
import GitHub from '../ui/icons/GitHub';
import {useT} from '../i18n';
import {Link} from '../ui/ui';
import {warmPage} from './registry';
import type {NavGroup, ShellView} from './view';

type SideNavProps = {
  groups: NavGroup[];
  busy: boolean;
  engine: ShellView['engine'];
  navRef: RefObject<HTMLElement | null>;
  navStyle: CSSProperties | undefined;
};

// Navigation follows the open page, not its query: a tab or filter change leaves it alone.
export const SideNav = memo(function SideNav({groups, busy, engine, navRef, navStyle}: SideNavProps) {
  const t = useT();
  return (
    <nav className="rp-side" ref={navRef} aria-busy={busy || undefined}>
      {navStyle && <span className="rp-nav-slider" style={navStyle} />}
      {groups.map(group => (
        <div key={group.id} data-group={group.id}>
          <div className="rp-group">{group.label}</div>
          {group.items.map(item => (
            <RLink
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
            </RLink>
          ))}
        </div>
      ))}
      <div className="rp-side-grow" />
      <Link appearance="version" href={engine.href} external label={t('github')}>
        <GitHub />
        {engine.text}
      </Link>
    </nav>
  );
});
