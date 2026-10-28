import * as stylex from '@stylexjs/stylex';
// Geometry retained from Astryx templates; spacing still uses theme tokens.
export const geometry = stylex.defineVars({
  searchHeight: 'min(30rem, calc(100dvh - var(--spacing-8)))',
  settingsHeight: 'min(50rem, calc(100dvh - var(--spacing-8)))'
});
// Room for list insets, a status dot, the policy, the latency and a name.
export const groupListMinRem = 22;
export const MEDIA = {
  wide: '(min-width: 1280px)',
  orchestrate: '(max-width: 1023px)',
  phone: '(max-width: 767px)',
  settings: '(max-width: 640px)'
} as const;
