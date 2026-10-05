import type {CSSProperties} from 'react';
import './styles/swatch.css';

// One variant's background, surface, text, accent and success colours, separated by spaces.
export type SwatchColours = string;
export type SwatchProps = {swatch: readonly [light: SwatchColours, dark: SwatchColours]; look?: 'glass' | 'lens'};

// A palette as a tiny app window, after macOS's Appearance picker, split diagonally: the light variant top left and the
// dark one, turned half a turn, bottom right. Each half has its background, a sidebar, a card with a text line and a
// status dot, and an accent pill. `glass` shows the wallpaper through the sidebar and card; `lens` adds Liquid Glass's rim.
export function Swatch({swatch, look}: SwatchProps) {
  return (
    <span className="rp-swatch" data-look={look} aria-hidden="true">
      {swatch.map((colours, index) => {
        const [bg, surface, text, accent, positive] = colours.split(' ');
        return (
          <span
            key={index}
            data-dark={index === 1 || undefined}
            style={{'--sw-bg': bg, '--sw-surface': surface, '--sw-text': text, '--sw-accent': accent, '--sw-positive': positive} as CSSProperties}
          >
            <i />
          </span>
        );
      })}
    </span>
  );
}
