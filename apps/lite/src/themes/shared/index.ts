/** Non-colour adjustments for the site theme: controls, typography, icons and scrollbars. */
import {spacingDefaults, type ThemeAdaptations} from '@astryxdesign/core/theme';
import {appIconRegistry} from './icons';

declare module '@astryxdesign/core/Card' {
  interface CardVariantMap {
    brand: true;
  }
}

/** Shared type scale; explicit site heading tokens keep the page hierarchy aligned. */
export const panelScale = {base: 15, ratio: 1.2} as const;

// CJK uses the platform fonts; only Figtree is shipped.
export const cjkFallbacks =
  '"PingFang TC", "PingFang SC", "Noto Sans CJK TC", "Noto Sans CJK SC", "Source Han Sans TC", "Microsoft JhengHei", "Microsoft YaHei"';

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
              // Astryx 0.6.8 has no grouped-button hit-area API.
              ':is(.astryx-stack[data-direction="horizontal"][data-gap="1"]:has(> .astryx-button ~ .astryx-button) > *)::before': {
                insetInline: `max(calc(var(--spacing-1) / -2), ${touchHit.insetInline})`
              },
              // A trailing action uses the text gap, not the row's scrollable inline end.
              // Astryx 0.6.8 has no trailing-button hit-area API.
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
    // Keep Core's 4px spacing scale.
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
      base: {':is(.lite-disclosure > button > *)': {marginBlockStart: 'var(--spacing-1)'}},
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
        ':is([data-skeleton-row] [data-drag-handle])': {color: 'var(--color-text-secondary)'},
        ':active': {
          transform: 'scale(.98)'
        }
      }
    },
    'text-input': {base: {borderRadius: 'var(--radius-element)', ':is(.lite-collection-toolbar *)': {maxWidth: '100%'}}},
    'text-area-control': {
      base: {':is([data-code-editor] *)': {fontFamily: 'var(--font-family-code)', tabSize: '2', whiteSpace: 'pre', overflowWrap: 'normal', overflowX: 'auto'}}
    },
    'collapsible-trigger': {
      base: {
        ':is(.lite-disclosure > *)': {gridColumn: '1', gridRow: '1', minWidth: '0', alignItems: 'flex-start'},
        ':is(.lite-subscription-row *)': {paddingInline: 'var(--spacing-3)'}
      }
    },
    'collapsible-content': {base: {':is(.lite-disclosure > *)': {gridColumn: '1 / -1', gridRow: '2', minWidth: '0'}}},
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
    'layout-content': {base: {...thin, ':is(.lite-shell [role="main"])': {overflow: 'clip'}}},
    'layout-panel': {base: thin},
    'scrollable-area': {base: thin},
    // Library scrollers the list above missed; without it they drew the
    // 15px native bar with arrow buttons. Tables scroll sideways at narrow
    // widths; a Card and the Dialog surface scroll when their content is long.
    'table-scroll-wrapper': {base: thin},
    dialog: {base: {...thin, ':where(*) :has(> .lite-dialog-content)': {display: 'flex', flexDirection: 'column'}}},
    // `brand` remains available to themed Card consumers.
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
