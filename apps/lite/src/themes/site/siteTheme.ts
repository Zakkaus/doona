// Based on Astryx's site theme, with the console's typography and neutral controls.
import {colorDefaults, defineTheme, type TokenValue} from '@astryxdesign/core/theme';
import {appIconRegistry, cjkFallbacks, systemMono, panelScale, panelShared} from '../shared';

const PRIMARY = 'light-dark(#15110C, #DFE2E5)';
const figtree = `${cjkFallbacks}, sans-serif`;
const selectionBorder = {
  content: '""',
  position: 'absolute',
  inset: '0',
  border: 'var(--border-width) solid var(--color-border-emphasized)',
  borderRadius: 'inherit',
  pointerEvents: 'none'
} as const;

const customTokens: Record<string, TokenValue> = {
  '--lite-primary-background': 'light-dark(#292929, #DFE2E5)',
  '--lite-primary-text': 'light-dark(var(--color-on-dark), var(--color-on-light))',
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
    '--color-accent-muted': 'light-dark(rgba(21, 17, 12, 0.05), rgba(223, 226, 229, 0.08))',
    '--color-on-accent': 'light-dark(var(--color-on-dark), var(--color-on-light))',
    '--color-warning': 'var(--color-icon-orange)',
    '--color-warning-muted': 'var(--color-background-orange)',
    '--color-background-body': 'var(--color-background-surface)',
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
    '--focus-outline-color': colorDefaults['--color-accent'],
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
        borderRadius: 'var(--radius-element)',
        backgroundColor: 'var(--lite-primary-background)',
        color: 'var(--lite-primary-text)'
      },
      'variant:destructive': {borderRadius: 'var(--radius-element)'}
    },
    'side-nav-item': {
      selected: {backgroundColor: 'var(--color-accent-muted)'}
    },
    item: {
      base: {
        ':is([aria-current="true"], [aria-selected="true"])': {backgroundColor: 'var(--color-accent-muted)'},
        ':is([aria-current="true"], [aria-selected="true"])::after': selectionBorder
      }
    },
    'selectable-card': {
      base: {
        ':is([data-selected="true"])': {
          borderColor: 'var(--color-border-emphasized)',
          backgroundColor: 'var(--color-accent-muted)',
          boxShadow: 'none'
        }
      }
    },
    'radio-list-item': {base: {':is([aria-current="true"])': {backgroundColor: 'var(--color-accent-muted)'}}},
    dialog: {base: {...panelShared.components.dialog.base, backgroundColor: 'var(--color-background-popover)'}},
    'bottom-sheet': {base: {'--color-background-surface': 'var(--color-background-popover)'}},
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
