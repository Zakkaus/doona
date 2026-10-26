/**
 * The panel's non-colour adjustments, shared by every theme variant: control
 * sizes, supporting text, icon sizes, the text-input/input-group/list fixes,
 * thin scrollbars, the `brand` Card variant and the Spectrum registry. Each
 * variant is `defineTheme({name, extends: <official theme>, icons, tokens, components})`
 * plus its own typography (`panelScale`), which keeps the theme's fonts.
 */
import {spacingDefaults, type ThemeAdaptations} from '@astryxdesign/core/theme';
import {appIconRegistry} from './icons';

declare module '@astryxdesign/core/Card' {
  interface CardVariantMap {
    brand: true;
  }
}

/**
 * Shared type scale. The base is 15px on every theme, one step above the
 * default ramp's 14px text with 32px controls. The ratio is 1.2 on all
 * of them so headings land at the same size and position whichever theme is
 * picked (the official gothic, matcha and y2k themes use 1.25 on a 16px base).
 * `typography` replaces the base theme's config, so each variant repeats its
 * own fonts beside this scale.
 */
export const panelScale = {base: 15, ratio: 1.2} as const;

// CJK uses the platform fonts; only Figtree is shipped.
export const cjkFallbacks = '"PingFang TC", "Microsoft JhengHei"';

/** Fallback stack for UI text, as the official themes use it, plus Chinese. */
export const sansFallbacks = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, ${cjkFallbacks}, Arial, sans-serif`;

/** System monospace stack; no additional font download. */
export const systemMono = {
  family: 'ui-monospace',
  fallbacks: '"SF Mono", Monaco, Consolas, monospace'
} as const;

// Thin native scrollbars. Astryx draws no scrollbar and has no scrollbar
// token, so each scroll viewport it renders sets the width (it does not
// inherit) and the thumb takes the emphasized border tone.
const thin = {
  scrollbarColor: 'var(--color-border-emphasized) transparent',
  scrollbarWidth: 'thin'
} as const;

const touchTarget = 'var(--size-element-lg)';
const touchHit = {
  content: '""',
  position: 'absolute',
  insetBlock: `min(0px, calc((100% - ${touchTarget}) / 2))`,
  insetInline: `min(0px, calc((100% - ${touchTarget}) / 2))`,
  pointerEvents: 'auto'
} as const;
// Astryx hides the native input under its indicator; removing its native appearance enables a hit pseudo-element.
const nativeTouchHit = {
  ':where(*) input[type="checkbox"]': {appearance: 'none'},
  ':where(*) input[type="checkbox"]::before': touchHit
} as const;

export {appIconRegistry};

// Theme CSS has no nested @media, so reduced motion goes through adaptations.
// Typed up front: as an inferred literal, the rules widen into a union that
// defineTheme rejects.
const adaptations: ThemeAdaptations = {
  rules: [
    {
      when: {motion: 'reduce' as const},
      value: {components: {button: {base: {':active': {transform: 'none'}}}}}
    },
    {
      when: {pointer: 'coarse' as const},
      value: {
        components: {
          button: {
            base: {
              '::before': touchHit,
              ':is(.astryx-stack[data-direction="horizontal"][data-gap="1"]:has(> .astryx-button ~ .astryx-button) > *)::before': {
                insetInline: `max(calc(var(--spacing-1) / -2), ${touchHit.insetInline})`
              },
              // A trailing action uses the text gap, not the row's scrollable inline end.
              ':is(.astryx-stack[data-direction="horizontal"][data-gap="2"] > .astryx-text + .astryx-button:last-of-type)::before': {
                insetInlineStart: `min(0px, calc(100% - ${touchTarget}))`,
                insetInlineEnd: '0'
              }
            }
          },
          'segmented-control-item': {base: {'::before': touchHit}},
          tab: {base: {position: 'relative', '::before': touchHit}},
          'collapsible-trigger': {base: {position: 'relative', '::before': touchHit}},
          // These wrappers already establish a stacking context; keep native inputs above the hit area.
          'text-input': {base: {'::before': {...touchHit, zIndex: '-1'}}},
          selector: {base: {'::before': {...touchHit, zIndex: '-1'}}},
          'checkbox-input': {base: nativeTouchHit},
          'switch-field': {base: nativeTouchHit},
          'side-nav-heading': {base: {position: 'relative', '::before': touchHit}},
          'side-nav-item': {
            base: {
              position: 'relative',
              // Adjacent navigation rows have only half a spacing step between them.
              '::before': {...touchHit, insetBlock: 'calc(var(--spacing-1) / -4)'}
            }
          },
          'list-item': {base: {':is(a, button)::before': touchHit}}
        }
      }
    }
  ]
};

export const panelShared = {
  tokens: {
    // Core's 4px spacing scale on every theme: matcha and y2k stretch it to
    // 6px steps, which moved the page padding and the whole layout.
    ...spacingDefaults,
    // Control heights move up one 4px step: sm 32, md 36, lg 40. Supporting
    // text stays 13px on a 20px line.
    '--size-element-sm': '32px',
    '--size-element-md': '36px',
    '--size-element-lg': '40px',
    '--text-supporting-size': '0.8125rem',
    '--text-supporting-leading': '1.5385'
  },
  components: {
    // Icons move up one step with the 15px type; Astryx sizes them in rem.
    icon: {
      'size:xsm': {width: '1rem', height: '1rem'},
      'size:sm': {width: '1.25rem', height: '1.25rem'},
      'size:md': {width: '1.5rem', height: '1.5rem'},
      'size:lg': {width: '1.75rem', height: '1.75rem'}
    },
    // InputGroup joins only inputs, so a TextInput followed by IconButtons
    // got square inner corners beside rounded buttons. Every control keeps
    // the full element radius and the group spaces them apart instead.
    // Press feedback as on the Astryx homepage. Button already transitions
    // transform over --duration-fast with --ease-standard, so only the pressed
    // state is added; the hover overlay keeps each theme's own timing. The
    // reduced-motion rule in `panelShared.adaptations` removes the scale.
    button: {
      base: {
        ':active': {
          transform: 'scale(.98)'
        }
      }
    },
    'text-input': {base: {borderRadius: 'var(--radius-element)'}},
    'input-group': {base: {gap: 'var(--spacing-1)'}},
    // List clips its rows in the inline axis so a swiped row stays inside it.
    // No list here uses swipe actions, but every one inside a card uses
    // edgeCompensation, which pulls each row 8px out into the card padding so
    // the row text lines up with the heading. The clip cut that 8px off again:
    // the hover tint ended flush with the icon and lost its rounded corners.
    list: {base: {overflowX: 'visible'}},
    'app-shell': {base: thin},
    'app-shell-sidenav': {base: thin},
    layout: {base: thin},
    'layout-content': {base: thin},
    'layout-panel': {base: thin},
    'scrollable-area': {base: thin},
    // Library scrollers the list above missed; without it they drew the
    // 15px native bar with arrow buttons. Tables scroll sideways at narrow
    // widths; a Card and the Dialog surface scroll when their content is long.
    'table-scroll-wrapper': {base: thin},
    dialog: {base: thin},
    // `brand` Card: a flat accent-muted surface for the dashboard greeting.
    // SelectableCard rings an added variant in `--selectable-card-ring-color`.
    card: {
      base: thin,
      'variant:brand': {
        backgroundColor: 'var(--color-accent-muted)',
        '--selectable-card-ring-color': 'var(--color-accent)'
      }
    }
  },
  adaptations
};
