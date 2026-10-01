import {useEffect, useState} from 'react';
import {useT} from '../i18n';
import {storageKeys} from '../api/storage';
import {Link} from '../ui/ui';
import {PageLinks} from '../ui/PageLinks';
import type {NavGroup} from './view';

const key = storageKeys.hubPages;
function readLast(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

// Below the side navigation's breakpoint, the hubs sit in a bottom bar after the Material 3 navigation bar: an icon
// and a label each, the open hub's icon on a pill. A hub opens on the page last seen in it this session. Moving between
// hubs or pages adds a history entry, as a web page does, so Back returns to the page seen before.
export function HubBar({groups}: {groups: NavGroup[]}) {
  const t = useT();
  const [last, setLast] = useState(readLast);
  const open = groups.flatMap(group => group.items.filter(item => item.current).map(item => [group.id, item.path] as const))[0];
  if (open && last[open[0]] !== open[1]) setLast({...last, [open[0]]: open[1]});
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(last));
    } catch {
      /* Storage can be unavailable; the bar then remembers for this page load. */
    }
  }, [last]);
  return (
    <nav className="rp-hubbar" aria-label={t('shell.hubs')}>
      {groups.map(group => {
        const Icon = group.items[0].Icon;
        return (
          <Link
            key={group.id}
            href={(group.items.find(item => item.path === last[group.id]) ?? group.items[0]).href}
            aria-current={open?.[0] === group.id ? 'page' : undefined}
          >
            <span className="rp-hubbar-pill">
              <Icon />
            </span>
            {group.label}
          </Link>
        );
      })}
    </nav>
  );
}

// The open hub's pages stay whole when they wrap on a narrow screen.
export function HubPages({hub}: {hub: NavGroup}) {
  return (
    <div className="rp-hubnav">
      <PageLinks label={hub.label} items={hub.items} />
    </div>
  );
}
