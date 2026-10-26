/**
 * Motion values for the panel. The easing is Astryx's `--ease-standard`
 * (the official homepage curve); durations are shorter than the homepage's
 * because the panel is used all day. Every primitive in this folder reads
 * these, so retuning one number retunes the pattern everywhere.
 */
export const EASE = 'cubic-bezier(0.24, 1, 0.4, 1)';

export const MOTION = {
  /** Page open: each section rises this far and fades in. */
  pageRise: 8,
  pageDuration: 360,
  pageStagger: 50,
  /** Sections after the sixth share the sixth step's delay. */
  pageSteps: 6,
  swapDuration: 240,
  draftDuration: 240,
  draftShift: 16,
  moveDuration: 240,
  moveScale: 0.98,
  /** Horizontal travel of a directional swap (wizard step). */
  swapShift: 16,
  /** Table rows: each rises this far and fades in, a smaller page open. */
  rowRise: 6,
  rowDuration: 280,
  rowStagger: 30,
  /** Rows start this long after their card begins to enter (page open). */
  rowLead: 120
} as const;

/** `Animation.id` of the page-open stagger, which rows time themselves by. */
export const PAGE_ENTER_ID = 'page-enter';
export const ROW_ENTER_ID = 'row-enter';

/** True when the page is laid out right to left. */
export function isRtl(el: Element): boolean {
  return getComputedStyle(el).direction === 'rtl';
}
