import {useState, type ReactNode} from 'react';
import {useNearViewport} from './hooks';
import {Button} from './Button';
import {TitlesShown} from './Card';
import './styles/widget-gallery.css';

// A gallery item, after S2's card anatomy: the name as a heading, a preview in a frame of the same size and scale as
// every other item's, and the add action with its count as help text under it.
export function WidgetGalleryTile({
  id,
  label,
  added,
  addLabel,
  count,
  onAdd,
  children
}: {
  id: string;
  label: string;
  added: boolean;
  addLabel: string;
  count: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  const [tileRef, visible] = useNearViewport(undefined, 200);
  const [loaded, setLoaded] = useState(false);
  if (visible && !loaded) setLoaded(true);
  return (
    <section ref={tileRef} className="rp-widget-gallery-tile" data-added={added || undefined} data-module={id} aria-label={label}>
      <h3 className="rp-h3">{label}</h3>
      <div className="rp-widget-gallery-frame" inert>
        <TitlesShown value={false}>{loaded && children}</TitlesShown>
      </div>
      <div className="rp-cluster">
        <Button isDisabled={added} label={`${addLabel} ${label}`} onPress={onAdd}>
          {addLabel}
        </Button>
        <span className="rp-label">{count}</span>
      </div>
    </section>
  );
}
