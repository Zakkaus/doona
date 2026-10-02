import {useState, type CSSProperties, type ReactNode} from 'react';
import {Button as RButton} from 'react-aria-components';
import {useContentSize, useNearViewport} from './hooks';
import {Button} from './Button';
import {TitlesShown} from './Card';
import './styles/widget-gallery.css';

// One of a gallery item's sizes: its share of a row, the card drawn at that size, and the action that adds it so.
export type GalleryPreset = {key: string; label: string; addLabel: string; share: number; preview: ReactNode; onAdd: () => void};
// The page's row the presets stand for: its width and gap, in px.
export type GalleryRow = {width: number; gap: number};

// A gallery item, after S2's card anatomy: the name as a heading, a preview in a frame of the same size and scale as
// every other item's, and the add action with its count as help text under it. With presets, the frame holds one
// thumbnail per size instead: each card at its real width on the page, scaled as the whole row is to the frame.
export function WidgetGalleryTile({
  id,
  label,
  added,
  addLabel,
  count,
  onAdd,
  presets,
  row,
  children
}: {
  id: string;
  label: string;
  added: boolean;
  addLabel: string;
  count: string;
  onAdd: () => void;
  presets?: GalleryPreset[];
  row?: GalleryRow;
  children?: ReactNode;
}) {
  const [tileRef, visible] = useNearViewport(undefined, 200);
  const [loaded, setLoaded] = useState(false);
  if (visible && !loaded) setLoaded(true);
  return (
    <section ref={tileRef} className="rp-widget-gallery-tile" data-added={added || undefined} data-module={id} aria-label={label}>
      <h3 className="rp-h3">{label}</h3>
      {presets && row ? (
        <Presets presets={presets} row={row} loaded={loaded} disabled={added} />
      ) : (
        <div className="rp-widget-gallery-frame" inert>
          <TitlesShown value={false}>{loaded && children}</TitlesShown>
        </div>
      )}
      <div className="rp-cluster">
        <Button isDisabled={added} label={`${addLabel} ${label}`} onPress={onAdd}>
          {addLabel}
        </Button>
        <span className="rp-label">{count}</span>
      </div>
    </section>
  );
}

function Presets({presets, row, loaded, disabled}: {presets: GalleryPreset[]; row: GalleryRow; loaded: boolean; disabled: boolean}) {
  const [ref, size] = useContentSize<HTMLDivElement>(Math.round);
  const scale = size ? size.width / row.width : 0;
  return (
    <div ref={ref} className="rp-widget-gallery-presets" style={{'--rp-preset-gap': `${row.gap * scale}px`} as CSSProperties}>
      {loaded &&
        scale > 0 &&
        presets.map(preset => (
          <Thumbnail key={preset.key} preset={preset} width={preset.share * (row.width + row.gap) - row.gap} scale={scale} disabled={disabled} />
        ))}
    </div>
  );
}
// The card keeps its page layout at its real width and is scaled into the thumbnail, which takes the scaled size. The
// card is inert; the button over it adds the preset.
function Thumbnail({preset, width, scale, disabled}: {preset: GalleryPreset; width: number; scale: number; disabled: boolean}) {
  const [ref, size] = useContentSize<HTMLDivElement>(Math.round);
  return (
    <div className="rp-widget-gallery-preset" style={{inlineSize: width * scale}}>
      <div className="rp-widget-gallery-thumb" style={{blockSize: (size?.height ?? 0) * scale}}>
        <div ref={ref} className="rp-widget-gallery-thumb-card" style={{inlineSize: width, scale: String(scale)}} inert>
          <TitlesShown value={false}>{preset.preview}</TitlesShown>
        </div>
        <RButton className="rp-widget-gallery-thumb-add" aria-label={preset.addLabel} isDisabled={disabled} onPress={preset.onAdd} />
      </div>
      <span className="rp-label">{preset.label}</span>
    </div>
  );
}
