import {Link} from './Link';
import {ControlSizeContext} from './controlSize';

export function PageLinks({label, items}: {label: string; items: {id: string; href: string; label: string; current?: boolean}[]}) {
  return (
    <ControlSizeContext value="L">
      <nav className="rp-page-links" aria-label={label}>
        {items.map(item => (
          <Link key={item.id} appearance="button" href={item.href} aria-current={item.current ? 'page' : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>
    </ControlSizeContext>
  );
}
