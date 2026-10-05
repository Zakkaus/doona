import '../ui/styles/swatch.css';
import type {CSSProperties} from 'react';
import type {PaletteId} from './palettes';
import {swatchOf} from './swatches';

// A palette menu row's swatch, a dot split diagonally like the Settings one: the light variant's background top left
// and the dark one's bottom right, each half with its accent in the centre. Glass shows its wallpaper behind both. The
// menus load this module when first pointed at, so it stays out of the startup bundle.
export default function PaletteSwatch({id}: {id: PaletteId}) {
  const {swatch, look} = swatchOf(id);
  return (
    <span className="rp-dot" data-look={look && 'glass'} aria-hidden="true">
      {swatch.map((colours, index) => {
        const [bg, , , accent] = colours.split(' ');
        return <span key={index} data-dark={index === 1 || undefined} style={{'--sw-bg': bg, '--sw-accent': accent} as CSSProperties} />;
      })}
    </span>
  );
}
