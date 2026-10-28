/**
 * The Astryx focus ring for focusable elements that are not Astryx controls
 * (a `time` with a hover card, a clickable table row, a chart frame). Astryx
 * controls draw `--focus-outline-width` `--focus-outline-style`
 * `--focus-outline-color` at `--focus-outline-offset` (2px solid accent, 3px
 * out) on `:focus-visible`; these use the same tokens, so both look alike.
 *
 *   <time tabIndex={0} {...stylex.props(focusRing)}>…</time>
 *   xstyle={[focusRingInset]} where an outer ring would be clipped (table rows)
 */
import * as stylex from '@stylexjs/stylex';
import {focusVars} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  outer: {
    outlineWidth: {default: '0', ':focus-visible': focusVars['--focus-outline-width']},
    outlineStyle: {default: 'none', ':focus-visible': focusVars['--focus-outline-style']},
    outlineColor: {default: null, ':focus-visible': focusVars['--focus-outline-color']},
    outlineOffset: {default: '0', ':focus-visible': focusVars['--focus-outline-offset']}
  },
  inset: {
    outlineWidth: {default: null, ':focus-visible': focusVars['--focus-outline-width']},
    outlineStyle: {default: null, ':focus-visible': focusVars['--focus-outline-style']},
    outlineColor: {default: null, ':focus-visible': focusVars['--focus-outline-color']},
    outlineOffset: {default: null, ':focus-visible': `calc(-1 * ${focusVars['--focus-outline-width']})`}
  }
});

/** Ring on the element itself when it has keyboard focus. */
export const focusRing = styles.outer;

/** The same ring drawn inside the element, for rows in a clipping scroller. */
export const focusRingInset = styles.inset;
