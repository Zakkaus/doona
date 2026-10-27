// Based on Astryx's site theme, with the console's typography and duck accent.
import {defineTheme, type TokenValue} from '@astryxdesign/core/theme';
import {appIconRegistry, cjkFallbacks, systemMono, panelScale, panelShared} from '../shared';

const PRIMARY = 'light-dark(#15110C, #DFE2E5)';
const figtree = `${cjkFallbacks}, sans-serif`;
const selectionIndicator = {
  content: '""',
  position: 'absolute',
  insetBlock: 'var(--spacing-2)',
  insetInlineStart: 'var(--spacing-0)',
  width: 'var(--spacing-0-5)',
  backgroundColor: 'var(--color-accent)',
  pointerEvents: 'none'
} as const;

const customTokens: Record<string, TokenValue> = {
  '--lite-primary-background': 'light-dark(#15110C, var(--color-accent))',
  '--lite-primary-text': 'light-dark(var(--color-on-dark), var(--color-on-light))',
  '--color-brand': 'light-dark(#225BFF, #3D87FF)',
  '--astryx-marketing-feature-card-bg': 'light-dark(#E6F0FF, #1A2333)'
};

export const siteTheme = defineTheme({
  name: 'site',
  icons: appIconRegistry,
  tokens: {
    // Darkening the duck yellow keeps light-mode indicators above 3:1.
    '--color-accent': 'light-dark(#8A7800, #FFDD00)',
    '--color-text-accent': PRIMARY,
    '--color-icon-accent': 'var(--color-accent)',
    '--color-accent-muted': 'light-dark(rgba(21, 17, 12, 0.08), rgba(223, 226, 229, 0.14))',
    '--color-on-accent': 'var(--color-on-light)',
    '--color-background-body': 'light-dark(#F8F4ED, #111112)',
    '--color-background-surface': 'light-dark(#FFFFFF, #1B1B1E)',
    '--color-background-card': 'light-dark(#FFFFFF, #27272B)',
    '--color-background-popover': 'light-dark(#FFFFFF, #333338)',
    '--color-text-primary': PRIMARY,
    '--color-icon-primary': PRIMARY,
    '--text-heading-1-size': '1.5rem',
    '--text-heading-1-leading': '1.3333',
    '--text-heading-2-size': '1.125rem',
    '--text-heading-2-leading': '1.5556',
    '--text-heading-3-size': '0.9375rem',
    '--text-heading-3-leading': '1.6',
    '--text-heading-4-size': '0.78125rem',
    '--text-heading-4-leading': '1.6',
    '--text-display-1-weight': 'var(--font-weight-semibold)',
    '--text-display-2-weight': 'var(--font-weight-semibold)',
    '--text-display-3-weight': 'var(--font-weight-semibold)',
    '--radius-inner': 'var(--radius-element)',
    '--radius-element': '8px',
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
    'nav-icon': {base: {backgroundColor: 'var(--color-accent)', color: 'var(--color-on-accent)'}},
    button: {
      base: {
        ...panelShared.components.button.base,
        borderRadius: 'var(--radius-element)'
      },
      'variant:primary': {
        borderRadius: 'var(--radius-full)',
        backgroundColor: 'var(--lite-primary-background)',
        color: 'var(--lite-primary-text)'
      },
      'variant:destructive': {borderRadius: 'var(--radius-full)'}
    },
    'side-nav-item': {
      selected: {position: 'relative', '::after': selectionIndicator}
    },
    item: {
      base: {':is([aria-current="true"], [aria-selected="true"])::after': selectionIndicator}
    },
    'radio-list-item': {base: {':is([aria-current="true"])': {backgroundColor: 'var(--color-accent-muted)'}}},
    dialog: {base: {...panelShared.components.dialog.base, backgroundColor: 'var(--color-background-popover)'}},
    'bottom-sheet': {base: {'--color-background-surface': 'var(--color-background-popover)'}},
    'segmented-control': {
      base: {
        borderWidth: 'var(--border-width)',
        borderStyle: 'solid',
        borderColor: 'var(--color-border-emphasized)',
        padding: 'calc(var(--spacing-0-5) - var(--border-width))'
      },
      'size:lg': {
        padding: 'var(--spacing-0)',
        borderWidth: 'var(--spacing-0)',
        outlineWidth: 'var(--border-width)',
        outlineStyle: 'solid',
        outlineColor: 'var(--color-border-emphasized)',
        outlineOffset: 'calc(-1 * var(--border-width))'
      }
    },
    'segmented-control-item': {base: {borderRadius: 'var(--radius-element)'}},
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
