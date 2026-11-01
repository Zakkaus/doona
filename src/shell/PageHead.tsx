import type {Ref} from 'react';
import {PageLinks} from '../ui/PageLinks';
import type {NavGroup} from './view';

// The page's heading row: its title and the question under it, the actions its page puts there, and below them the
// open hub's pages, which stay whole when they wrap on a narrow screen. The shell draws it over a page and over a
// startup Skeleton alike, so the content starts at the same place in both. Over a startup Skeleton it is a placeholder
// for the layout only: its title is hidden from the accessibility tree, since the page has no heading to read or wait
// on, and no shortcut to answer, until the shell mounts and draws its own, and its page links are inert, since nothing
// follows a link until then.
export function PageHead({
  title,
  hint,
  hub,
  actions,
  placeholder
}: {
  title: string;
  hint?: string;
  hub?: NavGroup;
  actions?: Ref<HTMLDivElement>;
  placeholder?: boolean;
}) {
  return (
    <div className="rp-head">
      <div className="rp-page-heading">
        <div className="rp-title" aria-hidden={placeholder || undefined}>
          <h1 className="rp-h1">{title}</h1>
          {hint && <span className="rp-hint">{hint}</span>}
        </div>
        <div ref={actions} className="rp-page-actions" />
      </div>
      {hub && (
        <div key={hub.id} className="rp-hubnav" inert={placeholder}>
          <PageLinks label={hub.label} items={hub.items} />
        </div>
      )}
    </div>
  );
}
