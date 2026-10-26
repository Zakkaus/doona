/**
 * The official Astryx site's theme, ported from the `astryx` theme at
 * apps/docsite/src/themes/astryxTheme.ts in https://github.com/facebook/astryx
 * (a local copy sits at /scratch/ssd/astryx-home-research/src/themes/).
 * Upstream extends nothing: it sets a few tokens on core's defaults, so this
 * port extends nothing either. Colours, radii, display weights, pill buttons,
 * TopNav and pagination dots are upstream's; the panel's shared adjustments
 * (control sizes, 15px type scale, ...) go on top. Two upstream values changed:
 *  - BRAND_BLUE comes from `../constants` upstream; it is inlined here as the
 *    computed value on the live site (#225BFF light, #3D87FF dark).
 *  - Figtree is named directly instead of `var(--font-figtree, Figtree)`, as
 *    this app has no `--font-figtree` variable.
 */
import {defineTheme, type TokenValue} from '@astryxdesign/core/theme';
import {appIconRegistry, cjkFallbacks, systemMono, panelScale, panelShared} from '../shared';

// High-emphasis ink: drives text, icons and the accent tokens (upstream's
// "PRIMARY"), so buttons, links and focus rings read near-black, not blue.
const PRIMARY = 'light-dark(#15110C, #DFE2E5)';
const PRIMARY_MUTED = 'light-dark(rgba(21, 17, 12, 0.08), rgba(223, 226, 229, 0.14))';
const figtree = `"Figtree Variable", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, ${cjkFallbacks}, Arial, sans-serif`;

// Custom (non-core) tokens, both upstream's. The brand blue marks one landing
// demo card; the feature-card
// tint is the official landing's bento background (apps/docsite globals.css).
const customTokens: Record<string, TokenValue> = {
  '--color-brand': 'light-dark(#225BFF, #3D87FF)',
  '--astryx-marketing-feature-card-bg': 'light-dark(#E6F0FF, #1A2333)'
};

export const siteTheme = defineTheme({
  name: 'site',
  icons: appIconRegistry,
  tokens: {
    '--color-accent': PRIMARY,
    '--color-text-accent': PRIMARY,
    '--color-icon-accent': PRIMARY,
    '--color-accent-muted': PRIMARY_MUTED,
    '--color-on-accent': 'light-dark(#FFFFFF, #15110C)',
    '--color-background-body': 'light-dark(#F8F4ED, #111112)',
    '--color-text-primary': PRIMARY,
    '--color-icon-primary': PRIMARY,
    '--text-display-1-weight': 'var(--font-weight-semibold)',
    '--text-display-2-weight': 'var(--font-weight-semibold)',
    '--text-display-3-weight': 'var(--font-weight-semibold)',
    '--radius-inner': '8px',
    '--radius-element': '12px',
    '--radius-container': '16px',
    '--radius-page': '32px',
    ...panelShared.tokens,
    ...customTokens
  },
  typography: {
    scale: panelScale,
    body: {family: 'Figtree', fallbacks: figtree},
    heading: {family: 'Figtree', fallbacks: figtree},
    code: systemMono
  },
  adaptations: panelShared.adaptations,
  components: {
    ...panelShared.components,
    // The brand mark (landing nav and footer, panel heading) in the accent, like
    // primary buttons (owner 2026-10-14: brand blue was too blue for the theme).
    'nav-icon': {base: {backgroundColor: 'var(--color-accent)', color: 'var(--color-on-accent)'}},
    // Pill buttons across all variants and sizes.
    button: {base: {...panelShared.components.button.base, borderRadius: 'var(--radius-full)'}},
    // TopNav: no pill background on the selected item.
    'top-nav-item': {
      selected: {
        backgroundColor: 'transparent',
        ':hover': {backgroundColor: 'var(--color-overlay-hover)'},
        ':active': {backgroundColor: 'var(--color-overlay-pressed)'}
      }
    },
    'pagination-dot': {
      base: {
        width: '10px',
        height: '10px',
        backgroundColor: 'transparent',
        borderWidth: '2px',
        borderStyle: 'solid',
        borderColor: 'color-mix(in srgb, var(--color-accent) 60%, transparent)',
        boxSizing: 'border-box',
        transitionProperty: 'width, background-color, border-color',
        transitionDuration: 'var(--duration-fast)',
        transitionTimingFunction: 'var(--ease-standard)',
        ':hover': {backgroundColor: 'var(--color-accent-muted)'}
      },
      active: {
        width: 'var(--spacing-7)',
        backgroundColor: 'var(--color-accent)',
        borderColor: 'var(--color-accent)',
        borderRadius: 'var(--radius-full)',
        ':hover': {backgroundColor: 'var(--color-accent)'}
      }
    }
  }
});
