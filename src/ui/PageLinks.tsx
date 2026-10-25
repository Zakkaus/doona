import {Link} from './Link';

// A hub's sibling pages, drawn as S2's Tabs: quiet labels over a divider with the current page underlined, so the row
// reads as navigation between pages rather than as the page's own tabs, which are a segmented control.
export function PageLinks({label, items}: {label: string; items: {id: string; href: string; label: string; current?: boolean}[]}) {
  return (
    <nav className="rp-page-links" aria-label={label}>
      {items.map(item => (
        <Link key={item.id} appearance="button" quiet href={item.href} aria-current={item.current ? 'page' : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
